import {
  EMAIL_VERIFICATION_TTL_SECONDS,
  MAGIC_LINK_TTL_SECONDS,
} from "./policy";

/**
 * Textes des emails d'authentification, déclenchés par la personne elle-même (inscription,
 * demande de lien). Rien de ce qui est saisi dans un formulaire n'y est recopié : le nom est
 * choisi par celui qui s'inscrit, pas par le destinataire. Le lien n'apparaît que dans le corps.
 */

export type AuthEmailContent = {
  readonly subject: string;
  readonly text: string;
};

const IGNORE = "Si tu n'es pas à l'origine de cette demande, ignore cet email";

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const [count, unit] =
    minutes % 60 === 0 ? [minutes / 60, "heure"] : [minutes, "minute"];
  return `${count} ${unit}${count > 1 ? "s" : ""}`;
}

const body = (...paragraphs: string[]) =>
  ["Bonjour,", ...paragraphs, "Trouvio"].join("\n\n");

export function verificationEmail({ url }: { url: string }): AuthEmailContent {
  return {
    subject: "Confirme ton adresse email",
    text: body(
      `Pour activer ton compte Trouvio, ouvre ce lien, puis saisis le mot de passe choisi à l'inscription :\n${url}`,
      `Il est valable ${formatDuration(EMAIL_VERIFICATION_TTL_SECONDS)}.`,
      "Tu n'as pas créé ce compte ? Sur la même page, demande un lien de connexion : il retire tout mot de passe que tu n'aurais pas choisi.",
      `${IGNORE} : aucun compte ne sera activé.`,
    ),
  };
}

export function magicLinkEmail({ url }: { url: string }): AuthEmailContent {
  return {
    subject: "Ton lien de connexion à Trouvio",
    text: body(
      `Pour te connecter à Trouvio, ouvre ce lien :\n${url}`,
      `Il est valable ${formatDuration(MAGIC_LINK_TTL_SECONDS)} et ne sert qu'une fois.`,
      `${IGNORE} : personne ne peut se connecter sans ce lien.`,
    ),
  };
}

export function existingAccountEmail({
  signInUrl,
}: {
  signInUrl: string;
}): AuthEmailContent {
  return {
    subject: "Tu as déjà un compte Trouvio",
    text: body(
      "Quelqu'un vient de demander la création d'un compte Trouvio avec cette adresse, qui en a déjà un.",
      `Si c'était toi, connecte-toi ici (tu peux y demander un lien de connexion si tu n'as plus ton mot de passe) :\n${signInUrl}`,
      `${IGNORE} : ton compte n'a pas changé.`,
    ),
  };
}

/**
 * Inscription sur une adresse dont le compte n'est pas activé : peut-être commencé par un tiers avec
 * son propre mot de passe (pré-détournement, ADR 0017). Le lien magique retire ce mot de passe.
 */
export function unverifiedAccountEmail({
  signInUrl,
}: {
  signInUrl: string;
}): AuthEmailContent {
  return {
    subject: "Ton compte Trouvio n'est pas activé",
    text: body(
      "Un compte a été commencé avec cette adresse sans être activé. Pour le reprendre, demande un lien de connexion : il retire tout mot de passe que tu n'aurais pas choisi.",
      `Tu peux le demander ici :\n${signInUrl}`,
      `${IGNORE} : rien ne change tant que personne n'ouvre de lien envoyé à cette adresse.`,
    ),
  };
}
