nssm install WoodwingListener "C:\Program Files\nodejs\node.exe"
nssm set WoodwingListener AppDirectory "D:\Listener"
nssm set WoodwingListener AppParameters index.js
nssm set WoodwingListener Description "Listens for events in the Woodwing system and triggers actions on certain events."
nssm start WoodwingListener