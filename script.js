// Cole aqui a URL do Web App do Google Apps Script, terminada em /exec.
// Use a URL da IMPLANTAÇÃO, não a URL do editor do Apps Script e nem a URL /dev.
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby0tYzbCXKwmW4VOW2Sb2x6H8dMWxuCRFoK13cTGvAdbKD7L-IOrOQF5HuatBGV7BUt-w/exec";

const form = document.getElementById("formRegistro");
const mensagem = document.getElementById("mensagem");
const btnSalvar = document.getElementById("btnSalvar");
const btnAtualizar = document.getElementById("btnAtualizar");
const classificacaoPreview = document.getElementById("classificacaoPreview");

const campos = {
  dataHora: document.getElementById("dataHora"),
  sistolica: document.getElementById("sistolica"),
  diastolica: document.getElementById("diastolica"),
  bpm: document.getElementById("bpm"),
  humor: document.getElementById("humor"),
  observacao: document.getElementById("observacao"),
};

const CLASSIFICACOES_VALIDAS = [
  "Normal",
  "Normal limítrofe",
  "Hipertensão leve (estágio 1)",
  "Hipertensão moderada (estágio 2)",
  "Hipertensão grave (estágio 3)",
  "Hipertensão sistólica isolada",
];

let registros = [];
let graficoPressao = null;
let graficoBpm = null;
let graficoClassificacao = null;

function agoraDatetimeLocal() {
  const agora = new Date();
  agora.setMinutes(agora.getMinutes() - agora.getTimezoneOffset());
  return agora.toISOString().slice(0, 16);
}

function formatarData(valor) {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function mostrarMensagem(texto, tipo = "") {
  mensagem.textContent = texto;
  mensagem.className = `message ${tipo}`;
}

function validarConfiguracao() {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes("COLE_AQUI")) {
    throw new Error("Cole a URL do Apps Script no arquivo script.js. Ela deve terminar em /exec.");
  }
  if (!APPS_SCRIPT_URL.includes("/exec")) {
    throw new Error("Use a URL de implantação do Apps Script terminada em /exec, não a URL /dev.");
  }
}

function classificarPA(sistolica, diastolica) {
  const pas = Number(sistolica);
  const pad = Number(diastolica);

  if (!pas || !pad) return "";

  if (pas >= 140 && pad < 90) {
    return "Hipertensão sistólica isolada";
  }

  const nivelSistolica =
    pas < 130 ? 0 :
    pas <= 139 ? 1 :
    pas <= 159 ? 2 :
    pas <= 179 ? 3 :
    4;

  const nivelDiastolica =
    pad < 85 ? 0 :
    pad <= 89 ? 1 :
    pad <= 99 ? 2 :
    pad <= 109 ? 3 :
    4;

  const nivelFinal = Math.max(nivelSistolica, nivelDiastolica);

  return [
    "Normal",
    "Normal limítrofe",
    "Hipertensão leve (estágio 1)",
    "Hipertensão moderada (estágio 2)",
    "Hipertensão grave (estágio 3)"
  ][nivelFinal];
}

function classificacaoValida(valor) {
  return CLASSIFICACOES_VALIDAS.includes(String(valor || ""));
}

function classeClassificacao(texto) {
  if (!texto) return "neutra";
  if (texto === "Normal") return "normal";
  if (texto === "Normal limítrofe") return "limitrofe";
  if (texto.includes("leve")) return "leve";
  if (texto.includes("moderada")) return "moderada";
  if (texto.includes("grave")) return "grave";
  if (texto.includes("sistólica isolada")) return "isolada";
  return "neutra";
}

function normalizarItemRecebido(item) {
  const corrigido = { ...item };

  // Corrige registros recebidos com deslocamento:
  // classificacao = BPM; bpm = humor; humor = observação.
  const classificacaoPareceBpm = corrigido.classificacao !== "" && corrigido.classificacao !== undefined && !Number.isNaN(Number(corrigido.classificacao));
  const bpmPareceHumor = typeof corrigido.bpm === "string" && corrigido.bpm !== "" && Number.isNaN(Number(corrigido.bpm));
  const classificacaoInvalida = !classificacaoValida(corrigido.classificacao);

  if (classificacaoInvalida && (classificacaoPareceBpm || bpmPareceHumor)) {
    const antigoBpm = corrigido.classificacao;
    const antigoHumor = corrigido.bpm;
    const antigaObservacao = corrigido.humor;

    corrigido.bpm = antigoBpm || "";
    corrigido.humor = antigoHumor || "";
    corrigido.observacao = antigaObservacao || corrigido.observacao || "";
    corrigido.classificacao = classificarPA(corrigido.sistolica, corrigido.diastolica);
  }

  if (!classificacaoValida(corrigido.classificacao)) {
    corrigido.classificacao = classificarPA(corrigido.sistolica, corrigido.diastolica);
  }

  return corrigido;
}

function atualizarPreviewClassificacao() {
  if (!classificacaoPreview) return;

  const classificacao = classificarPA(campos.sistolica.value, campos.diastolica.value);

  if (!classificacao) {
    classificacaoPreview.textContent = "Informe PAS e PAD para ver a classificação.";
    classificacaoPreview.className = "classification-preview neutra";
    return;
  }

  const classe = classeClassificacao(classificacao);
  classificacaoPreview.textContent = `Classificação: ${classificacao}`;
  classificacaoPreview.className = `classification-preview preview-${classe}`;
}

function jsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = `jsonp_callback_${Date.now()}_${Math.round(Math.random() * 100000)}`;
    const separator = url.includes("?") ? "&" : "?";
    const script = document.createElement("script");

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Não foi possível carregar os dados. Confira se o Web App está público e se a URL /exec está correta."));
    }, 15000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Falha ao acessar o Apps Script. Teste a URL /exec em aba anônima."));
    };

    script.src = `${url}${separator}callback=${callbackName}`;
    document.body.appendChild(script);
  });
}

async function apiGetRegistros() {
  validarConfiguracao();

  const json = await jsonp(`${APPS_SCRIPT_URL}?action=list`);
  if (!json.ok) throw new Error(json.error || "Erro ao carregar dados.");
  return (json.data || []).map(normalizarItemRecebido);
}

async function apiPostSemCors(body) {
  validarConfiguracao();

  await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(body),
  });
}

async function apiSalvarRegistro(dados) {
  await apiPostSemCors({
    action: "create",
    payload: dados,
  });
}

async function apiExcluirRegistro(id) {
  await apiPostSemCors({
    action: "delete",
    id,
  });
}

function ordenarPorData(lista) {
  return [...lista].sort((a, b) => new Date(a.dataHora) - new Date(b.dataHora));
}

function atualizarCards(lista) {
  const ordenados = ordenarPorData(lista);
  const ultimo = ordenados[ordenados.length - 1];

  document.getElementById("totalRegistros").textContent = lista.length;

  if (!ultimo) {
    document.getElementById("ultimaMedicao").textContent = "—";
    document.getElementById("ultimaData").textContent = "—";
    document.getElementById("ultimaClassificacao").textContent = "—";
    document.getElementById("mediaGeral").textContent = "—";
    return;
  }

  document.getElementById("ultimaMedicao").textContent = `${ultimo.sistolica}/${ultimo.diastolica}`;
  document.getElementById("ultimaData").textContent = formatarData(ultimo.dataHora);
  document.getElementById("ultimaClassificacao").textContent = ultimo.classificacao || classificarPA(ultimo.sistolica, ultimo.diastolica);

  const medias = lista.reduce((acc, item) => {
    acc.sistolica += Number(item.sistolica || 0);
    acc.diastolica += Number(item.diastolica || 0);
    return acc;
  }, { sistolica: 0, diastolica: 0 });

  const mediaSis = Math.round(medias.sistolica / lista.length);
  const mediaDia = Math.round(medias.diastolica / lista.length);
  document.getElementById("mediaGeral").textContent = `${mediaSis}/${mediaDia}`;
}

function renderizarTabela(lista) {
  const tbody = document.getElementById("tabelaRegistros");
  const recentes = ordenarPorData(lista).reverse();

  if (!recentes.length) {
    tbody.innerHTML = `<tr><td colspan="7">Nenhum registro encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = recentes.map(item => {
    const classificacao = item.classificacao || classificarPA(item.sistolica, item.diastolica);
    const classe = classeClassificacao(classificacao);

    return `
      <tr>
        <td>${formatarData(item.dataHora)}</td>
        <td><strong>${item.sistolica}/${item.diastolica}</strong></td>
        <td><span class="badge ${classe}">${classificacao}</span></td>
        <td>${item.bpm || "—"}</td>
        <td>${item.humor || "—"}</td>
        <td>${item.observacao || "—"}</td>
        <td>
          <button class="danger" onclick="excluirRegistro('${item.id}')">Excluir</button>
        </td>
      </tr>
    `;
  }).join("");
}

function criarOuAtualizarGraficoPressao(lista) {
  const ctx = document.getElementById("graficoPressao");
  if (!ctx) return;

  const ordenados = ordenarPorData(lista);

  if (graficoPressao) graficoPressao.destroy();

  graficoPressao = new Chart(ctx, {
    type: "line",
    data: {
      labels: ordenados.map(item => formatarData(item.dataHora)),
      datasets: [
        {
          label: "Sistólica",
          data: ordenados.map(item => Number(item.sistolica)),
          tension: 0.35,
          borderWidth: 3,
          pointRadius: 4,
        },
        {
          label: "Diastólica",
          data: ordenados.map(item => Number(item.diastolica)),
          tension: 0.35,
          borderWidth: 3,
          pointRadius: 4,
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: { y: { beginAtZero: false } }
    }
  });
}

function criarOuAtualizarGraficoBpm(lista) {
  const ctx = document.getElementById("graficoBpm");
  if (!ctx) return;

  const ordenados = ordenarPorData(lista).filter(item => item.bpm !== "" && !Number.isNaN(Number(item.bpm)));

  if (graficoBpm) graficoBpm.destroy();

  graficoBpm = new Chart(ctx, {
    type: "line",
    data: {
      labels: ordenados.map(item => formatarData(item.dataHora)),
      datasets: [
        {
          label: "BPM",
          data: ordenados.map(item => Number(item.bpm)),
          tension: 0.35,
          borderWidth: 3,
          pointRadius: 4,
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: { y: { beginAtZero: false } }
    }
  });
}

function criarOuAtualizarGraficoClassificacao(lista) {
  const ctx = document.getElementById("graficoClassificacao");
  if (!ctx) return;

  const contagem = CLASSIFICACOES_VALIDAS.reduce((acc, item) => {
    acc[item] = 0;
    return acc;
  }, {});

  lista.forEach(item => {
    const classificacao = item.classificacao || classificarPA(item.sistolica, item.diastolica);
    if (!contagem[classificacao]) contagem[classificacao] = 0;
    contagem[classificacao] += 1;
  });

  const labels = Object.keys(contagem).filter(label => contagem[label] > 0);
  const valores = labels.map(label => contagem[label]);

  if (graficoClassificacao) graficoClassificacao.destroy();

  graficoClassificacao = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Registros", data: valores, borderWidth: 1 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

function renderizarTudo() {
  atualizarCards(registros);
  renderizarTabela(registros);
  criarOuAtualizarGraficoPressao(registros);
  criarOuAtualizarGraficoBpm(registros);
  criarOuAtualizarGraficoClassificacao(registros);
}

async function carregarRegistros() {
  try {
    mostrarMensagem("Carregando registros...");
    registros = await apiGetRegistros();
    renderizarTudo();
    mostrarMensagem("Dados atualizados.", "ok");
  } catch (erro) {
    console.error(erro);
    mostrarMensagem(erro.message, "erro");
  }
}

async function excluirRegistro(id) {
  const confirmou = confirm("Deseja excluir este registro?");
  if (!confirmou) return;

  try {
    mostrarMensagem("Excluindo registro...");
    await apiExcluirRegistro(id);

    setTimeout(async () => {
      await carregarRegistros();
      mostrarMensagem("Registro excluído.", "ok");
    }, 900);
  } catch (erro) {
    console.error(erro);
    mostrarMensagem(erro.message, "erro");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const classificacao = classificarPA(campos.sistolica.value, campos.diastolica.value);

  const dados = {
    dataHora: campos.dataHora.value,
    sistolica: Number(campos.sistolica.value),
    diastolica: Number(campos.diastolica.value),
    bpm: campos.bpm.value ? Number(campos.bpm.value) : "",
    humor: campos.humor.value,
    observacao: campos.observacao.value.trim(),
    classificacao,
  };

  if (dados.diastolica >= dados.sistolica) {
    mostrarMensagem("Confira os valores: a diastólica normalmente deve ser menor que a sistólica.", "erro");
    return;
  }

  try {
    btnSalvar.disabled = true;
    mostrarMensagem("Salvando registro...");
    await apiSalvarRegistro(dados);

    form.reset();
    campos.dataHora.value = agoraDatetimeLocal();
    atualizarPreviewClassificacao();

    setTimeout(async () => {
      await carregarRegistros();
      mostrarMensagem("Registro salvo com sucesso.", "ok");
      btnSalvar.disabled = false;
    }, 900);
  } catch (erro) {
    console.error(erro);
    mostrarMensagem(erro.message, "erro");
    btnSalvar.disabled = false;
  }
});

btnAtualizar.addEventListener("click", carregarRegistros);
campos.sistolica.addEventListener("input", atualizarPreviewClassificacao);
campos.diastolica.addEventListener("input", atualizarPreviewClassificacao);

campos.dataHora.value = agoraDatetimeLocal();
atualizarPreviewClassificacao();
carregarRegistros();
