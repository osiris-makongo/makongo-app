# Makongo — appli mobile

Interface téléphone de Makongo, une IA personnelle privée.

- **PC allumé** : les questions vont au cerveau du PC par une adresse privée (Tailscale), que l'utilisateur saisit dans l'appli. Elle n'est enregistrée que sur son téléphone.
- **PC éteint ou occupé** : un modèle Qwen2.5 3B Instruct tourne dans Chrome sur le téléphone (WebGPU, [WebLLM](https://github.com/mlc-ai/web-llm)). Il garde la même charte et une copie de la mémoire, faite à la dernière connexion au PC.

Ce dépôt ne contient que l'interface : aucune donnée personnelle, aucune adresse, aucun secret. La mémoire et le profil restent sur le PC et dans le stockage local du téléphone.

## Licences

- `web-llm.js` : WebLLM 0.2.89, © MLC, licence Apache 2.0.
- Police Chakra Petch : licence SIL Open Font License 1.1 (`polices/OFL-ChakraPetch.txt`).
- Modèle téléchargé sur le téléphone : Qwen2.5-3B-Instruct, licence Qwen Research (usage non commercial), via Hugging Face (mlc-ai).
