import { FAQ, STAGES } from "./content";

// Simple rule-based assistant. To use a real AI model, replace botReply
// with a fetch() to your own server route that calls an LLM API.
const words = (s) => s.toLowerCase().match(/[a-z]{4,}/g) || [];

export function botReply(question, project) {
  const s = question.toLowerCase();

  if (project && /(status|progress|stage|how far|where are we|update)/.test(s)) {
    const latest = project.updates?.[0]?.text;
    return `Your project "${project.title}" is in the ${STAGES[project.stage]} stage and ${project.progress}% complete.${latest ? ` Latest update: ${latest}` : ""}`;
  }
  if (/(preview|see my site|see the site)/.test(s)) {
    return "Open the Preview tab to see your site as it is being built.";
  }

  const asked = new Set(words(s));
  let best = null;
  let bestScore = 0;
  for (const [q, a] of FAQ) {
    const score = words(`${q} ${a}`).filter((w) => asked.has(w)).length;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best || "I'm not sure about that one. Send a message in the Chat tab and the Nettech team will reply.";
}
