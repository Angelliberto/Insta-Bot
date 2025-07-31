require("dotenv").config();
const { IgApiClient } = require("instagram-private-api");  // Para interactuar con Instagram
const axios = require("axios");
const express = require("express");  
const OpenAI = require("openai");  // API de OpenAI para generar captions
const fs = require("fs-extra");  // Librería para trabajar con archivos
const path = require("path");  
const ffmpeg = require("fluent-ffmpeg");  // Para procesar y convertir videos
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");  // Para obtener la ruta de FFmpeg
const cron = require("node-cron");  // Para tareas programadas

// Establecer la ruta de FFmpeg
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Crear una instancia de Express para el servidor
const app = express();
const port = process.env.PORT || 4000;  
const POSTED_DB = path.join(__dirname, 'posted.json');  // Ruta al archivo JSON donde se guardan los IDs de publicaciones, NO UTILIZO BASE DE DATOS

// Función para cargar los IDs de los medios ya publicados
const loadPostedIds = async () => {
  try {
    // Asegurarse de que el archivo exista
    await fs.ensureFile(POSTED_DB);
    const data = await fs.readFile(POSTED_DB, "utf-8");  // Leer el archivo
    return JSON.parse(data || "[]");  // Parsear el contenido JSON
  } catch {
    return [];  // Si hay un error, devolver un arreglo vacío
  }
};

// Función para guardar un ID de un medio publicado
const savePostedId = async (id) => {
  const posted = await loadPostedIds();  // Cargar los IDs publicados
  posted.push(id);  // Agregar el nuevo ID
  await fs.writeJson(POSTED_DB, posted);  // Guardar el archivo actualizado
};

// Seleccionar el archivo mas antiguo sin publicar a Instagram desde Google Drive
const fetchDriveMedia = async () => {
  const apiKey = process.env.GDRIVE_API_KEY;
  const folderId = process.env.GDRIVE_FOLDER_ID;
  const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType,createdTime)&key=${apiKey}`;

  try {
    console.log("📡 Buscando medios en Google Drive...");
    const response = await axios.get(url);
    const files = response.data.files;

    if (!files || files.length === 0) {
      console.error("⚠️ No se encontraron archivos en la carpeta.");
      return null;
    }

    const posted = await loadPostedIds();
    const available = files.filter(file =>
      !posted.includes(file.id) &&
      ((file.mimeType.startsWith('image/') && /\.(jpe?g|png)$/i.test(file.name)) ||
       (file.mimeType.startsWith('video/') && /\.(mp4|mov)$/i.test(file.name)))
    );

    if (available.length === 0) {
      console.error("Ya se publicaron todos los archivos disponibles.");
      return null;
    }

    // Ordenar los archivos por la fecha de creación (más viejo primero)
    available.sort((a, b) => new Date(a.createdTime) - new Date(b.createdTime));

    const oldestFile = available[0];  // El archivo más viejo
    console.log(`Archivo seleccionado: ${oldestFile.name}`);

    return {
      id: oldestFile.id,  // ID del archivo
      name: oldestFile.name,  // Nombre del archivo
      url: `https://drive.google.com/uc?id=${oldestFile.id}`,  // URL directa para descargar el archivo
      isVideo: oldestFile.mimeType.startsWith('video/'),  // Verificar si es un video
    };
  } catch (error) {
    console.error("Error al obtener archivos de Drive:", error.message);  // Manejo de errores
    return null;
  }
};


// Función para generar el pie de foto utilizando OpenAI
/* En esta funcion se debe describir lo mas detallado posible las funciones del departamento,
utilice este como ejemplo basandome en las publicaciones de la cuenta oficial de CVG Venalum*/
const generateCaption = async (prompt) => {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });  // Crear instancia de OpenAI con la clave de API
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",  // Modelo de OpenAI
      messages: [
        {
          role: "system",
          content: `Redactor oficial de comunicaciones de CVG Venalum. Publicaciones institucionales, tono motivador y patriótico, etiquetar cuentas oficiales y usar hashtags institucionales segun el caso.`
        },
        {
          role: "user",
          content: `Generar un pie de foto para Instagram basado en el contexto: "${prompt}". Minimo dos parrafos, Maximo 3 parrafos. etiquetas: @nicolasmaduro @delcyrodriguezv @hectorsilvavzla @eduardopsuv @partidopsuv @mintrabajove @cvg_oficial @venalum_potencia_productiva | hashtags: #PuroAluminioVenezolano #NadaNosDetiene #VenezuelaPotencia #7TPlanTransformacionEconomica #TransformacionEconomica #CVGVenalum #ClaseTrabajadora.`
        }
      ]
    });
    return completion.choices[0].message.content;  // Devolver el caption generado
  } catch (error) {
    console.error("Error generando caption:", error.message); 
    return "CVG Venalum avanza con soberanía productiva. #PuroAluminioVenezolano";  
  }
};

// Función para publicar en Instagram
const postToInstagram = async () => {
  try {
    const ig = new IgApiClient();  // Crear una instancia de IgApiClient
    ig.state.generateDevice(process.env.IG_USERNAME);  // Generar un dispositivo para la sesión
    await ig.account.login(process.env.IG_USERNAME, process.env.IG_PASSWORD);  // Iniciar sesión en Instagram

    const media = await fetchDriveMedia();  // Obtener un medio no publicado
    if (!media) return;  // Si no hay medios disponibles, salir

    const prompt = media.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");  // Generar el prompt para el pie de foto
    const caption = await generateCaption(prompt);  // Obtener el pie de foto generado por OpenAI

    // Descargar el archivo de Google Drive
    const res = await axios.get(media.url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(res.data, 'binary');  // Convertir los datos descargados a un buffer

    // Si es un video, procesar con FFmpeg para generar una miniatura
    if (media.isVideo) {
      const tempVideo = path.join(__dirname, 'temp.mp4');
      const tempCover = path.join(__dirname, 'cover.jpg');
      fs.writeFileSync(tempVideo, buffer);  // Guardar el video descargado

      await new Promise((resolve, reject) => {
        ffmpeg(tempVideo)
          .on('end', resolve)
          .on('error', reject)
          .screenshots({ timestamps: ['1'], filename: 'cover.jpg', folder: __dirname, size: '640x?' });  // Crear miniatura
      });

      const videoBuffer = fs.readFileSync(tempVideo);  // Leer el video
      const coverBuffer = fs.readFileSync(tempCover);  // Leer la miniatura

      await ig.publish.video({ video: videoBuffer, coverImage: coverBuffer, caption });  // Publicar el video en Instagram

      fs.unlinkSync(tempVideo);  // Eliminar el archivo temporal del video
      fs.unlinkSync(tempCover);  // Eliminar el archivo temporal de la miniatura
    } else {
      await ig.publish.photo({ file: buffer, caption });  // Publicar la imagen en Instagram
    }

    await savePostedId(media.id);  // Guardar el ID del medio publicado
  } catch (error) {
    console.error("Error al publicar en Instagram:", error.message);  // Manejo de errores
  }
};

// Ruta manual para ejcutar la funcion de la publicación inmediatamente
app.get('/post-now', async (req, res) => {
  await postToInstagram();
  res.send('Publicación enviada a Instagram.');
});

// Tarea programada para publicar automáticamente todos los días a las 10:00 AM
cron.schedule('0 10 * * *', async () => {
  await postToInstagram();
});

// Iniciar el servidor Express
app.listen(port, () => console.log(`Servidor en http://localhost:${port}`));
