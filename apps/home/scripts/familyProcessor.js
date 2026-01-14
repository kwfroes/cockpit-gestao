// familyProcessor.js

const MAPA_ACENTOS = {
  "LOCACAO": "LOCAÇÃO",
  "SERVICO": "SERVIÇO",
  "SERVICOS": "SERVIÇOS",
  "COMUNICACAO": "COMUNICAÇÃO",
  "INFORMACAO": "INFORMAÇÃO",
  "MANUTENCAO": "MANUTENÇÃO",
  "ADMINISTRACAO": "ADMINISTRAÇÃO",
  "INSTALACAO": "INSTALAÇÃO",
  "OPERACAO": "OPERAÇÃO"
};

function acentuarTexto(texto = "") {
  let result = texto;
  for (const [sem, com] of Object.entries(MAPA_ACENTOS)) {
    result = result.replace(new RegExp(`\\b${sem}\\b`, "g"), com);
  }
  return result;
}

function calcularTipo(familia = "") {
  const parte = parseInt(familia.split(".")[0], 10);
  return parte >= 1 && parte <= 9 ? "S" : "M";
}

export function processarFamilias(data = []) {
  return data.map(item => ({
    ...item,
    Tipo: item.Tipo || calcularTipo(item["Família"] || item["Familia"]),
    Descrição: acentuarTexto(item["Descrição"] || item["Descricao"])
  }));
}
