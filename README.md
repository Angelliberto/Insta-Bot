# Publicador Automático de Instagram
## Requisitos

- **Node.js**: La versión recomendada es la más reciente.
- **FFmpeg**: Necesario para procesar videos.
- **Cuenta de Google Drive**: Para acceder a los medios.
- **API de OpenAI**: Para generar pies de foto automáticos.
- **Credenciales de Instagram**: Para iniciar sesión y publicar.

## Instalación
1. clona el repositorio:

   git clone https://github.com/Angelliberto/Insta-Bot

2. Accede al directorio del proyecto:

  cd insta-bot

3. Instalar dependecias
  
  npm install

4. Crear Archivo env

IG_USERNAME=nombre_usuario_de_instagram
IG_PASSWORD=contraseña_de_instagram

OPENAI_API_KEY=tu_clave_api_de_openai

GDRIVE_API_KEY=tu_clave_api_de_google_drive 
#Clave de API de Google Drive. Necesaria para autenticar la aplicación y poder hacer solicitudes para acceder a los archivos dentro de Google Drive.

GDRIVE_FOLDER_ID=tu_id_de_carpeta_en_drive 
#Este ID lo puedes obtener desde la URL de la carpeta de Drive (ejemplo: https://drive.google.com/drive/folders/<folder-id>).

PORT=4000

5. Ejecutar.

node index.js


## Publicación manual
activar una publicación manual en cualquier momento visitando la ruta /post-now de tu servidor:

 http://localhost:4000/post-now




  

