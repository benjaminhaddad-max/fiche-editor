/**
 * Exceptions voulues de l'Espace Social, écrites ici pour qu'on ne les
 * prenne plus pour des anomalies.
 *
 * Compte partagé : la fiche de paie est au nom du salarié, mais c'est un
 * proche qui remplit ses éléments depuis son propre compte. Le nom du compte
 * diffère donc de celui de la fiche, et c'est normal.
 */
export interface ComptePartage {
  /** Le salarié, tel que Silae le connaît. */
  salarie: string
  /** Celui qui remplit, titulaire du compte. */
  declarant: string
  pourquoi: string
}

export const COMPTES_PARTAGES: Record<string, ComptePartage> = {
  // Shirel, 25/11/2026 : « Pour Neorah Lussato, on garde aaron@diploma-sante.fr.
  // C'est son mari, c'est lui qui fera ses déclarations. »
  '00048': {
    salarie: 'LUSSATO Neorah',
    declarant: 'Aaron Sarfati',
    pourquoi: 'son mari remplit ses éléments de paie depuis son compte (décision de Shirel)',
  },
}

export const comptePartage = (matricule: string | null | undefined): ComptePartage | null =>
  (matricule && COMPTES_PARTAGES[matricule]) || null
