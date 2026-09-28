import { Poppins, Work_Sans } from "next/font/google";

// Téléchargées au build et servies par l'application : aucune requête du navigateur vers Google.
// Graisses : celles de docs/design/tokens.json (Poppins 700 ; Work Sans est variable).
export const poppins = Poppins({
  subsets: ["latin"],
  weight: ["700"],
  display: "swap",
  variable: "--font-poppins",
});

export const workSans = Work_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-work-sans",
});
