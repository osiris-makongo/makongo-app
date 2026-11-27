// Makongo mobile : une seule Makongo, deux cerveaux.
// - PC allumé et joignable (Tailscale) : le cerveau du PC répond, avec toute la mémoire.
// - Sinon : le cerveau du téléphone (Qwen2.5 3B dans Chrome, WebGPU), avec la même charte et
//   une copie de la mémoire faite à la dernière connexion au PC. Les notes prises hors ligne
//   attendent ici et partent vers le PC dès qu'il est de nouveau joignable.
// Aucune adresse, aucune donnée personnelle n'est dans ce code : tout reste sur le téléphone.
"use strict";

const MODELE_TELEPHONE = "Qwen2.5-3B-Instruct-q4f16_1-MLC";
const CLE = { adresse: "makongo-adresse-pc", copie: "makongo-copie", attente: "makongo-notes-en-attente" };
const $ = (id) => document.getElementById(id);
let historique = [];
let moteur = null;          // cerveau du téléphone, chargé à la demande
let mode = "inconnu";       // "pc", "telephone" ou "horsligne"

// --- Stockage local -----------------------------------------------------------------------
const lire = (cle, defaut) => { try { return JSON.parse(localStorage.getItem(cle)) ?? defaut; } catch { return defaut; } };
const ecrire = (cle, valeur) => localStorage.setItem(cle, JSON.stringify(valeur));
const adresse = () => (localStorage.getItem(CLE.adresse) || "").replace(/\/+$/, "");

// --- Affichage ------------------------------------------------------------------------------
function bulle(classe, texte = "") {
  const div = document.createElement("div");
  div.className = classe;
  div.textContent = texte;
  $("discussion").appendChild(div);
  $("discussion").scrollTop = $("discussion").scrollHeight;
  return div;
}

function afficherMode(nouveau) {
  mode = nouveau;
  const textes = { pc: "Cerveau du PC", telephone: "Mode téléphone", horsligne: "Hors ligne", inconnu: "…" };
  $("mode").textContent = textes[nouveau];
  $("reglages-bouton").className = `pastille ${nouveau}`;
}

// --- PC -------------------------------------------------------------------------------------
async function pcJoignable() {
  if (!adresse()) return false;
  try {
    const r = await fetch(`${adresse()}/api/etat`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function synchroniser() {
  // 1. Les notes prises hors ligne partent vers le PC.
  const attente = lire(CLE.attente, []);
  const restantes = [];
  for (const note of attente) {
    try {
      const r = await fetch(`${adresse()}/api/notes`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Makongo": "1" }, body: JSON.stringify(note),
      });
      if (!r.ok) restantes.push(note);
    } catch { restantes.push(note); }
  }
  ecrire(CLE.attente, restantes);
  // 2. Nouvelle copie de l'identité et de la mémoire pour le cerveau du téléphone.
  const r = await fetch(`${adresse()}/api/mobile`, { cache: "no-store" });
  if (!r.ok) throw new Error(`copie refusée (${r.status})`);
  const copie = await r.json();
  ecrire(CLE.copie, copie);
  majReglages();
  return copie;
}

async function demanderPC(question, cible) {
  const r = await fetch(`${adresse()}/api/demander`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Makongo": "1" },
    body: JSON.stringify({ question, historique }),
  });
  if (!r.ok) throw new Error(`le PC a répondu ${r.status}`);
  const lecteur = r.body.getReader();
  const decodeur = new TextDecoder();
  let reste = "", texte = "", info = "";
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    reste += decodeur.decode(value, { stream: true });
    const lignes = reste.split("\n");
    reste = lignes.pop();
    for (const brut of lignes.filter(Boolean)) {
      const e = JSON.parse(brut);
      if (e.type === "morceau") { texte += e.contenu; cible.textContent = texte; }
      else if (e.type === "statut" && !texte) cible.textContent = e.contenu;
      else if (e.type === "routage") info = e.contenu;
      else if (e.type === "erreur") throw new Error(e.contenu);
    }
    $("discussion").scrollTop = $("discussion").scrollHeight;
  }
  return { texte, info: `cerveau du PC — ${info}` };
}

// --- Téléphone ------------------------------------------------------------------------------
async function chargerCerveau() {
  if (moteur) return moteur;
  if (!navigator.gpu) throw new Error("Ce navigateur n'a pas WebGPU : ouvre l'appli dans Chrome à jour.");
  const webllm = await import("./web-llm.js");
  $("progression").hidden = false;
  moteur = await webllm.CreateMLCEngine(MODELE_TELEPHONE, {
    initProgressCallback: (p) => {
      $("progression").value = p.progress || 0;
      $("etat-cerveau").textContent = p.text;
    },
  });
  $("progression").hidden = true;
  $("etat-cerveau").textContent = "Cerveau du téléphone prêt (aussi sans Internet).";
  return moteur;
}

function notesUtiles(question, notes, nombre = 3) {
  // Recherche simple par mots communs (sur le PC, la recherche est hybride : mots-clés + sens).
  const mots = new Set(question.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter((m) => m.length > 3));
  return notes
    .map((n) => {
      const texte = `${n.titre} ${n.texte}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      return { n, score: [...mots].filter((m) => texte.includes(m)).length };
    })
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, nombre).map((x) => x.n);
}

async function demanderTelephone(question, cible) {
  const copie = lire(CLE.copie, null);
  if (!copie) throw new Error("Pas encore de copie de la mémoire : ouvre l'appli une fois avec le PC allumé.");
  cible.textContent = moteur ? "Le cerveau du téléphone réfléchit…" : "Démarrage du cerveau du téléphone…";
  const ia = await chargerCerveau();
  const notes = notesUtiles(question, copie.notes || []);
  let systeme = copie.systeme + "\n\nTu tournes en ce moment sur le téléphone (PC éteint) : réponds brièvement.";
  if (notes.length) {
    systeme += "\nNotes de la mémoire de Makongo (à utiliser si elles sont pertinentes) :\n" +
      notes.map((n) => `- [${n.domaine}] ${n.titre} : ${n.texte}`).join("\n");
  }
  const messages = [{ role: "system", content: systeme }, ...historique.slice(-6), { role: "user", content: question }];
  const flux = await ia.chat.completions.create({ messages, stream: true, temperature: 0.2, max_tokens: 400 });
  let texte = "";
  for await (const morceau of flux) {
    texte += morceau.choices[0]?.delta?.content || "";
    cible.textContent = texte;
    $("discussion").scrollTop = $("discussion").scrollHeight;
  }
  return { texte, info: `cerveau du téléphone — mémoire copiée le ${copie.copie}` };
}

// --- Notes ----------------------------------------------------------------------------------
async function noter(texte) {
  const note = { texte, domaine: "general", titre: texte.slice(0, 40) };
  if (mode === "pc") {
    const r = await fetch(`${adresse()}/api/notes`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Makongo": "1" }, body: JSON.stringify(note),
    });
    if (r.ok) return "Note ajoutée à la mémoire du PC.";
  }
  ecrire(CLE.attente, [...lire(CLE.attente, []), note]);
  const copie = lire(CLE.copie, null);
  if (copie) { copie.notes = [{ ...note, date: "en attente" }, ...(copie.notes || [])]; ecrire(CLE.copie, copie); }
  return "Note gardée sur le téléphone : elle partira vers le PC à la prochaine connexion.";
}

// --- Question -------------------------------------------------------------------------------
async function envoyer(question) {
  bulle("moi", question);
  const cible = bulle("elle", "…");
  if (question.startsWith("/note ")) {
    cible.textContent = await noter(question.slice(6).trim());
    return;
  }
  let reponse = null;
  if (await pcJoignable()) {
    afficherMode("pc");
    try {
      reponse = await demanderPC(question, cible);
    } catch (erreur) {
      // PC occupé (entraînement en cours) ou coupure : le cerveau du téléphone prend le relais.
      bulle("info", `PC indisponible (${erreur.message}) : le téléphone répond.`);
    }
  }
  if (!reponse) {
    afficherMode("telephone");
    reponse = await demanderTelephone(question, cible);
  }
  const { texte, info } = reponse;
  bulle("info", info);
  if (texte) {
    historique.push({ role: "user", content: question }, { role: "assistant", content: texte });
    historique = historique.slice(-12);
  }
}

$("formulaire").addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = $("question").value.trim();
  if (!question) return;
  $("question").value = "";
  $("envoyer").disabled = true;
  try {
    await envoyer(question);
  } catch (erreur) {
    bulle("elle erreur", String(erreur.message || erreur));
  } finally {
    $("envoyer").disabled = false;
  }
});
$("question").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("formulaire").requestSubmit(); }
});

// --- Réglages -------------------------------------------------------------------------------
function majReglages() {
  const copie = lire(CLE.copie, null);
  const attente = lire(CLE.attente, []).length;
  $("etat-copie").textContent = (copie ? `Mémoire copiée le ${copie.copie} (${(copie.notes || []).length} notes).`
    : "Aucune copie de la mémoire sur ce téléphone.") + (attente ? ` ${attente} note(s) en attente d'envoi.` : "");
}

$("reglages-bouton").addEventListener("click", () => { $("adresse").value = adresse(); majReglages(); $("reglages").showModal(); });
$("adresse").addEventListener("change", async () => {
  localStorage.setItem(CLE.adresse, $("adresse").value.trim());
  $("etat-pc").textContent = (await pcJoignable()) ? "PC joignable ✓" : "PC injoignable (éteint, ou Tailscale coupé).";
});
$("synchroniser").addEventListener("click", async () => {
  try { await synchroniser(); $("etat-pc").textContent = "Copie faite ✓"; afficherMode("pc"); }
  catch (e) { $("etat-pc").textContent = `Impossible : ${e.message}`; }
});
$("telecharger").addEventListener("click", async () => {
  $("telecharger").disabled = true;
  try { await chargerCerveau(); } catch (e) { $("etat-cerveau").textContent = String(e.message || e); }
  $("telecharger").disabled = false;
});
$("effacer-discussion").addEventListener("click", () => {
  historique = [];
  $("discussion").querySelectorAll(".moi, .elle, .info").forEach((n) => n.remove());
  $("reglages").close();
});
$("oublier").addEventListener("click", () => {
  localStorage.removeItem(CLE.copie);
  majReglages();
});

// --- Démarrage ------------------------------------------------------------------------------
(async () => {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
  if (!adresse()) { $("reglages").showModal(); $("etat-pc").textContent = "Entre l'adresse privée du PC pour commencer."; }
  if (await pcJoignable()) {
    afficherMode("pc");
    try { await synchroniser(); } catch { /* la copie précédente reste utilisable */ }
  } else {
    afficherMode(lire(CLE.copie, null) ? "telephone" : "horsligne");
  }
})();
