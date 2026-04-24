FROM searxng/searxng:latest

# Bake settings.yml into the image so no volume mount is needed
COPY searxng/settings.yml /etc/searxng/settings.yml

EXPOSE 8080
