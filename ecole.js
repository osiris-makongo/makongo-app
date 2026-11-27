// École : pilotage, depuis le téléphone, de l'apprentissage qui tourne sur le PC (makongo/apprentissage.py).
// Mêmes actions et mêmes garde-fous que l'onglet Éducation du PC : le serveur borne les limites,
// refuse un cycle si le PC est trop chaud, occupé ou débranché, et seul ton clic promeut un cerveau.
"use strict";

const $ = (id) => document.getElementById(id);
const adresse = () => (localStorage.getItem("makongo-adresse-pc") || "").replace(/\/+$/, "");
const MODES = { utilisation: "Utilisation", etude: "Étude", entrainement: "Entraînement" };
const CYCLES = { evaluation: "Évaluer", etude: "Étudier", entrainement: "Entraîner" };
let minuterie = null;

function el(balise, attributs = {}, ...enfants) {
  const n = document.createElement(balise);
  for (const [cle, valeur] of Object.entries(attributs)) {
    if (cle === "onclick") n.addEventListener("click", valeur);
    else if (cle === "class") n.className = valeur;
    else n.setAttribute(cle, valeur);
  }
  for (const enfant of enfants) n.append(enfant);
  return n;
}

async function api(chemin, corps) {
  const options = corps === undefined ? { cache: "no-store" }
    : { method: "POST", headers: { "Content-Type": "application/json", "X-Makongo": "1" }, body: JSON.stringify(corps) };
  const r = await fetch(`${adresse()}${chemin}`, { ...options, signal: AbortSignal.timeout(8000) });
  const donnees = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(donnees.erreur || `erreur ${r.status}`);
  return donnees;
}

async function action(chemin, corps, message) {
  try {
    await api(chemin, corps);
    afficherMessage(message, false);
  } catch (e) {
    afficherMessage(e.message, true);
  }
  await charger();
}

let dernierMessage = null;
function afficherMessage(texte, erreur) { dernierMessage = { texte, erreur }; }

function rendre(e) {
  const r = e.reglages, res = e.ressources, code = e.domaines.code;
  const blocs = [];
  if (dernierMessage) {
    blocs.push(el("p", { class: dernierMessage.erreur ? "ecole-erreur" : "ecole-ok" }, dernierMessage.texte));
  }
  // État du PC
  const occupe = res.occupe ? `occupé : ${res.occupe.nom} (depuis ${res.occupe.debut})` : "libre";
  blocs.push(el("div", { class: "ecole-etat" },
    el("span", {}, `${res.temperature ?? "?"} °C`), el("span", {}, res.secteur ? "branché" : "sur batterie"),
    el("span", {}, `${Math.round(res.ram_libre_mo / 1000)} Go libres`), el("span", {}, occupe)));
  // Garde-fou : bordure verte quand tout est approuvé, orange quand un fichier protégé attend ton accord.
  if (!e.regles_modifiees.length) {
    blocs.push(el("div", { class: "ecole-alerte ok" }, el("p", {}, "✓ Règles et examens approuvés : tout est à jour.")));
  } else {
    blocs.push(el("div", { class: "ecole-alerte" },
      el("p", {}, `Règles ou examens modifiés : ${e.regles_modifiees.join(", ")}. Aucun cycle ne démarre avant ton accord.`),
      el("button", { class: "secondaire", onclick: () => {
        if (confirm("Tu as vérifié ces changements et tu les approuves ?")) {
          action("/api/education/approuver-regles", {}, "Règles approuvées.");
        }
      } }, "J'ai vérifié, j'approuve")));
  }
  // Mode
  blocs.push(el("h3", {}, "Mode"));
  blocs.push(el("div", { class: "ecole-choix" }, ...Object.entries(MODES).map(([cle, nom]) =>
    el("button", { class: r.mode === cle ? "" : "secondaire",
      onclick: () => action("/api/education/reglage", { cle: "mode", valeur: cle }, `Mode ${nom}.`) }, nom))));
  // Durées
  const duree = (cle, nom) => {
    const champ = el("input", { type: "number", min: "1", max: String(e.limites_max[cle]), value: String(r[cle]) });
    champ.addEventListener("change", () => action("/api/education/reglage", { cle, valeur: Number(champ.value) },
      `${nom} : ${champ.value} min.`));
    return el("label", { class: "ecole-duree" }, `${nom} (min, max ${e.limites_max[cle]})`, champ);
  };
  blocs.push(duree("duree_etude_min", "Étude"), duree("duree_entrainement_min", "Entraînement"));
  // Cycles
  blocs.push(el("h3", {}, "Lancer"));
  blocs.push(el("div", { class: "ecole-choix" }, ...Object.entries(CYCLES).map(([cle, nom]) => {
    const bouton = el("button", { class: "secondaire",
      onclick: () => action("/api/education/cycle", { nom: cle }, `Cycle « ${nom} » lancé sur le PC.`) }, nom);
    bouton.disabled = Boolean(res.occupe);  // un seul gros calcul à la fois
    return bouton;
  })));
  // Compétences
  const c = code.compte || {};
  blocs.push(el("h3", {}, "Compétences en code"));
  blocs.push(el("p", { class: "aide" }, `${c.acquise ?? 0} acquises · ${c.en_cours ?? 0} en cours · ${c.lacune ?? 0} lacunes` +
    (code.reference ? ` — cerveau évalué : ${code.reference}` : "")));
  if (code.lecons?.length) {
    blocs.push(el("p", { class: "aide" }, "Prochaines leçons : " + code.lecons.map(([f, raison]) => `${f} (${raison})`).join(", ")));
  }
  // Cerveaux
  blocs.push(el("h3", {}, "Cerveaux"));
  for (const cerveau of e.cerveaux.filter((x) => x.domaine === "code").slice(0, 6)) {
    const ligne = el("div", { class: "ecole-cerveau" },
      el("span", {}, cerveau.nom), el("span", { class: `statut ${cerveau.statut}` }, cerveau.statut));
    if (cerveau.statut === "recommande") {
      ligne.append(el("button", { onclick: () => {
        if (confirm(`${cerveau.nom} devient le cerveau de code opérationnel. L'ancien est archivé et restaurable. Continuer ?`)) {
          action("/api/education/promouvoir", { nom: cerveau.nom }, `${cerveau.nom} est opérationnel.`);
        }
      } }, "Promouvoir"));
    }
    if (cerveau.note) ligne.append(el("small", {}, cerveau.note));
    blocs.push(ligne);
  }
  if (e.cerveaux.some((x) => x.statut === "archive")) {
    blocs.push(el("button", { class: "danger", onclick: () => {
      if (confirm("Revenir au cerveau de code précédent ?")) action("/api/education/restaurer", {}, "Version précédente rétablie.");
    } }, "Revenir à la version précédente"));
  }
  // Activité
  blocs.push(el("h3", {}, "Dernières activités"));
  blocs.push(el("ul", { class: "ecole-activite" }, ...e.activite.slice(0, 8).map((a) =>
    el("li", {}, `${a.date.slice(5, 16).replace("T", " ")} · ${a.detail}`))));
  $("ecole-contenu").replaceChildren(...blocs);
}

async function charger() {
  try {
    rendre(await api("/api/education"));
  } catch (e) {
    $("ecole-contenu").replaceChildren(el("p", { class: "ecole-erreur" },
      `PC injoignable (${e.message}). L'école ne fonctionne que si le PC est allumé et Tailscale actif.`));
  }
}

$("ecole-bouton").addEventListener("click", async () => {
  dernierMessage = null;
  $("ecole").showModal();
  await charger();
  clearInterval(minuterie);
  minuterie = setInterval(charger, 20000);  // suivi pendant que l'école est ouverte
});
$("ecole").addEventListener("close", () => clearInterval(minuterie));
