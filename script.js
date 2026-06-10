// 1) Cole aqui a URL do Web App do Google Apps Script, terminada em /exec.
// Exemplo: const APPS_SCRIPT_URL = "https://script.google.com/macros/s/SEU_ID/exec";
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxuDqH7BhDVZCAuuQUHNtqiLTu99KDvK0KMHdPx-kaNKUXEAxua9NOAxLU-wS8GiF72BQ/exec";

const form = document.getElementById("formRegistro");
const mensagem = document.getElementById("mensagem");
const btnSalvar = document.getElementById("btnSalvar");
const btnAtualizar = document.getElementById("btnAtualizar");

const campos = {
  dataHora: document.getElementById("dataHora"),
  sistolica: document.getElementById("sistolica"),
  diastolica: document.getElementById("diastolica"),
  bpm: document.getElementById("bpm"),
  humor: document.getElementById("humor"),
  observacao: document.getElementById("observacao"),
};

let registros = [];
let graficoPressao = null;
let graficoBpm = null;
let graficoHumor = null;

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
    throw new Error("Cole a URL do Apps Script no arquivo script.js.");
  }
}

async function apiGetRegistros() {
  validarConfiguracao();

  const resposta = await fetch(`${APPS_SCRIPT_URL}?action=list`, {
    method: "GET",
    redirect: "follow",
  });

  const json = await resposta.json();
  if (!json.ok) throw new Error(json.error || "Erro ao carregar dados.");
  return json.data || [];
}

async function apiSalvarRegistro(dados) {
  validarConfiguracao();

  const resposta = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({
      action: "create",
      payload: dados,
    }),
  });

  const json = await resposta.json();
  if (!json.ok) throw new Error(json.error || "Erro ao salvar registro.");
  return json;
}

async function apiExcluirRegistro(id) {
  validarConfiguracao();

  const resposta = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({
      action: "delete",
      id,
    }),
  });

  const json = await resposta.json();
  if (!json.ok) throw new Error(json.error || "Erro ao excluir registro.");
  return json;
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
    document.getElementById("mediaGeral").textContent = "—";
    return;
  }

  document.getElementById("ultimaMedicao").textContent = `${ultimo.sistolica}/${ultimo.diastolica}`;
  document.getElementById("ultimaData").textContent = formatarData(ultimo.dataHora);

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
    tbody.innerHTML = `<tr><td colspan="6">Nenhum registro encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = recentes.map(item => `
    <tr>
      <td>${formatarData(item.dataHora)}</td>
      <td><strong>${item.sistolica}/${item.diastolica}</strong></td>
      <td>${item.bpm || "—"}</td>
      <td>${item.humor || "—"}</td>
      <td>${item.observacao || "—"}</td>
      <td>
        <button class="danger" onclick="excluirRegistro('${item.id}')">Excluir</button>
      </td>
    </tr>
  `).join("");
}

function criarOuAtualizarGraficoPressao(lista) {
  const ctx = document.getElementById("graficoPressao");
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
      plugins: {
        legend: {
          position: "bottom"
        }
      },
      scales: {
        y: {
          beginAtZero: false
        }
      }
    }
  });
}

function criarOuAtualizarGraficoBpm(lista) {
  const ctx = document.getElementById("graficoBpm");
  const ordenados = ordenarPorData(lista).filter(item => item.bpm);

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
      plugins: {
        legend: {
          position: "bottom"
        }
      },
      scales: {
        y: {
          beginAtZero: false
        }
      }
    }
  });
}

function criarOuAtualizarGraficoHumor(lista) {
  const ctx = document.getElementById("graficoHumor");
  const contagem = lista.reduce((acc, item) => {
    const humor = item.humor || "Não informado";
    acc[humor] = (acc[humor] || 0) + 1;
    return acc;
  }, {});

  if (graficoHumor) graficoHumor.destroy();

  graficoHumor = new Chart(ctx, {
    type: "bar",
    data: {
      labels: Object.keys(contagem),
      datasets: [
        {
          label: "Registros",
          data: Object.values(contagem),
          borderWidth: 1,
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0
          }
        }
      }
    }
  });
}

function renderizarTudo() {
  atualizarCards(registros);
  renderizarTabela(registros);
  criarOuAtualizarGraficoPressao(registros);
  criarOuAtualizarGraficoBpm(registros);
  criarOuAtualizarGraficoHumor(registros);
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
    await carregarRegistros();
    mostrarMensagem("Registro excluído.", "ok");
  } catch (erro) {
    console.error(erro);
    mostrarMensagem(erro.message, "erro");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const dados = {
    dataHora: campos.dataHora.value,
    sistolica: Number(campos.sistolica.value),
    diastolica: Number(campos.diastolica.value),
    bpm: campos.bpm.value ? Number(campos.bpm.value) : "",
    humor: campos.humor.value,
    observacao: campos.observacao.value.trim(),
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

    await carregarRegistros();
    mostrarMensagem("Registro salvo com sucesso.", "ok");
  } catch (erro) {
    console.error(erro);
    mostrarMensagem(erro.message, "erro");
  } finally {
    btnSalvar.disabled = false;
  }
});

btnAtualizar.addEventListener("click", carregarRegistros);

campos.dataHora.value = agoraDatetimeLocal();
carregarRegistros();
