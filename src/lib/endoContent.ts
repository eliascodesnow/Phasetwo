export interface EndometriosisFact {
  text: string;
  organization: string;
  title: string;
  url: string;
}

export interface EndometriosisResource {
  organization: string;
  title: string;
  description: string;
  updated: string;
  url: string;
}

export const WHO_ENDOMETRIOSIS_URL = "https://www.who.int/news-room/fact-sheets/detail/endometriosis";

export const ENDOMETRIOSIS_FACTS: EndometriosisFact[] = [
  {
    text: "WHO estimates endometriosis affects about 10% of reproductive-age women worldwide.",
    organization: "World Health Organization",
    title: "Endometriosis fact sheet, 15 October 2025",
    url: WHO_ENDOMETRIOSIS_URL,
  },
  {
    text: "Symptoms can include severe menstrual pain, heavy bleeding, chronic pelvic pain, bloating, and nausea. These symptoms can have other causes too.",
    organization: "World Health Organization",
    title: "Endometriosis fact sheet, 15 October 2025",
    url: WHO_ENDOMETRIOSIS_URL,
  },
  {
    text: "Endometriosis symptoms can affect bowel movements or urination, as well as school, work, relationships, and wellbeing.",
    organization: "World Health Organization",
    title: "Endometriosis fact sheet, 15 October 2025",
    url: WHO_ENDOMETRIOSIS_URL,
  },
  {
    text: "A careful history of menstrual pain, bleeding, and associated symptoms can help a healthcare professional evaluate endometriosis.",
    organization: "World Health Organization",
    title: "Endometriosis fact sheet, 15 October 2025",
    url: WHO_ENDOMETRIOSIS_URL,
  },
  {
    text: "WHO reports that diagnosis can take several years; its fact sheet gives an average range of 4 to 12 years. Experiences and access to care vary.",
    organization: "World Health Organization",
    title: "Endometriosis fact sheet, 15 October 2025",
    url: WHO_ENDOMETRIOSIS_URL,
  },
  {
    text: "Severe period pain is not something you have to dismiss. Repeated or disruptive symptoms are worth discussing with a healthcare professional.",
    organization: "World Health Organization",
    title: "Endometriosis fact sheet, 15 October 2025",
    url: WHO_ENDOMETRIOSIS_URL,
  },
  {
    text: "Endometriosis has no known single cause. Treatment approaches can include medicines, surgery, and multidisciplinary symptom support, depending on individual needs.",
    organization: "World Health Organization",
    title: "Endometriosis fact sheet, 15 October 2025",
    url: WHO_ENDOMETRIOSIS_URL,
  },
];

export const ENDOMETRIOSIS_RESOURCES: EndometriosisResource[] = [
  {
    organization: "World Health Organization",
    title: "Endometriosis fact sheet",
    description: "Current information on symptoms, diagnosis, treatment, causes, and the impact of endometriosis.",
    updated: "15 October 2025",
    url: WHO_ENDOMETRIOSIS_URL,
  },
  {
    organization: "U.S. National Library of Medicine",
    title: "Endometriosis",
    description: "Government health information covering symptoms, diagnosis, and treatment options.",
    updated: "See source for current date",
    url: "https://medlineplus.gov/endometriosis.html",
  },
];

export const MEDICAL_DISCLAIMER =
  "Education only; not diagnosis or treatment. Seek medical advice for persistent, severe, or worsening symptoms.";