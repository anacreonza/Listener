# Woodwing Event Listener

This node.js app is a listener for events published from a Woodwing Studio server.

It can then check the status of the object that the event happened to and then can act on that in a few ways.

- Layouts can be packaged. When layouts reach a specific status they can be saved out fo the system, and all the links can also be saved in a Links subfolder.
- Dossiers can be archived. The entire contents of a dossier can be saved - the links in InDesign layouts can also be followed and saved.
- Articles can be indexed. The article itself (WCML file) can be saved. The metadata for the article is also saved and the .plaincontent property of the metadata json is saved as a plain .txt file. The content of the txt can also be indexed to an Elasticsearch index.
- Images can be processed. This is not working yet.

Woodwing Studio Server must be configured to emit events through the RabbitMQ Event integration. The URL of this app then needs to be registered with the server as a webhook. The server must have a corresponding username that the app uses to access the server.

These settings are set in the .env file. See the .envexample file for possible settings
