let port, reader;
let isPortOpen = false;
let bufferSerial = "";
let timestamps = new Set();
let bufferY1 = []; // Buffer para almacenar valores anteriores de y1Value

let dataBuffer = [];
const delaySize = 10; // Cantidad de lecturas de desfase

let xPoints = [];
let y1Points = [];

var s1Last = 0;
var s2Last = 0;
var y1PointsSMA = [];

//let nPoints = [];
var tMax1;
var tMax2;
var tMinP1;
var tMinP2;
var tMin1;
var tMin2;
var tMax21;
var tMax22;
var lineasMaxMin1;

var ts;
var trace1;

var layout;
var maxValues = 0;
var deltaT1;

var meanPPM1;

var stdPPM1;

var maxPoints = parseInt(document.getElementById("points_max").value);
const connectButton = document.getElementById("SerialConnect");
connectButton.style.backgroundColor = "green";
const sensor1Button = document.getElementById("sensor1");
sensor1Button.style.backgroundColor = "Aquamarine";
sensor1Button.addEventListener("click", toggleSensor1);

const borrarButton = document.getElementById("borrar");
//borrarButton.style.backgroundColor = "red";

document.getElementById("aboutBlock").style.display = "none";
document.getElementById("buildBlock").style.display = "none";
document.getElementById("codeBlock").style.display = "none";
document.getElementById("processBlock").style.display = "none";

document.getElementById("connectBlock").style.display = "none";

setInterval(updatePlot, 200);
async function connectSerial() {
  if (isPortOpen) {
    await disconnectSerial();
    return;
  } else {
    try {
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: 230400 });

      reader = port.readable.getReader();
      //document.getElementById("status").innerText = "Conectado";
      connectButton.value = "Desconectar";
      connectButton.style.backgroundColor = "red";
      isPortOpen = true;
      readSerialData();
    } catch (error) {
      console.error("Error al abrir el puerto:", error);
    }
  }
}
async function readSerialData() {
  const decoder = new TextDecoder();
  let lineBuffer = "";
  clearPlot();

  while (isPortOpen) {
    try {
      const { value, done } = await reader.read();
      if (done) break;
      lineBuffer += decoder.decode(value, { stream: true });

      let lines = lineBuffer.split("\n");
      lineBuffer = lines.pop();

      for (let line of lines) {
        // Separar por espacios y convertir a números
        let cols = line.trim().split(/\s+/).map(Number);

        // Validar que haya exactamente 2 valores numéricos y que ninguno sea NaN o 0
        if (
          cols.length === 2 &&
          cols.every((v) => !isNaN(v) && v !== 0) &&
          !timestamps.has(cols[1])
        ) {
          dataBuffer.push(cols);
          timestamps.add(cols[1]);
        }
      }
    } catch (err) {
      console.error("Error al leer:", err);
      break;
    }
  }
}
function updatePlot() {
  xPoints = [];
  y1Points = [];

  maxPoints = parseInt(document.getElementById("points_max").value);
  dataBuffer = dataBuffer.slice(-maxPoints);

  if (dataBuffer.length === 0) return;

  // Extraer datos válidos (filtrando ceros y NaN)
  for (let row of dataBuffer) {
    let [y1, t] = row;
    if (!isNaN(y1) && y1 !== 0 && !isNaN(t) && t !== 0) {
      xPoints.push(t / 1000);
      y1Points.push(y1);
    }
  }

  if (y1Points.length < 2) return; // No hay suficientes datos

  // Limitar a maxPoints
  if (y1Points.length > maxPoints) {
    y1Points = y1Points.slice(-maxPoints);
    xPoints = xPoints.slice(-maxPoints);
  }

  const alpha = parseFloat(document.getElementById("alpha").value);
  const M = parseFloat(document.getElementById("mediaMovil").value);

  // Aplicar media móvil si hay suficientes puntos
  let y1PointsSMA1 =
    y1Points.length >= M ? movingAverage(y1Points, M) : [...y1Points];
  let y1PointsSMA = butterworthLowPass(y1PointsSMA1, alpha);

  // Normalizar
  const n = y1PointsSMA.length;
  const mean1 = y1PointsSMA.reduce((sum, val) => sum + val, 0) / n || 0.0001;
  const std1 =
    Math.sqrt(
      y1PointsSMA.reduce((sum, val) => sum + (val - mean1) ** 2, 0) / n
    ) || 0.0001;
  let y1N;
  const scaled = document.getElementById("scaled").checked;
  if (scaled === true) {
    y1N = y1PointsSMA.map((v) => (v - mean1) / std1);
  } else {
    y1N = y1PointsSMA.map((v) => v);
  }
  // Calcular umbral
  const max1 = Math.max(...y1N);
  const min1 = Math.min(...y1N);
  umbral1 = min1 + (max1 - min1) * 0.65;

  // Detectar máximos/minimos
  [tMinP1, tMax21] = detectMaximaMinimaPrevio(y1N, xPoints, umbral1);
  [tMax1, tMin1] = detectMaximaMinimaPosterior(y1N, xPoints, umbral1);

  deltaT1 = tMax1.slice(1).map((valor, i) => valor - tMax1[i]);
  const arrPPM1 = deltaT1.map((valor) => 60 / valor);
  [meanPPM1, stdPPM1] = getMeanStDev(arrPPM1);

  // Preparar líneas de máximos/minimos
  lineasMaxMin1 = tMax1.map((mx) => ({
    type: "line",
    x0: mx,
    x1: mx,
    yref: "paper",
    y0: 0,
    y1: 1,
    line: { color: "blue", width: 1, dash: "dash" },
  }));

  const linea_umbral1 = {
    type: "line",
    xref: "paper",
    x0: 0,
    y0: umbral1,
    x1: 1,
    y1: umbral1,
    line: { color: "blue", width: 1, dash: "dot" },
  };

  trace1 = {
    x: xPoints,
    y: y1N,
    mode: "lines+markers",
    name: "Sensor 1",
    marker: { color: "blue", size: 4 },
    line: { color: "blue", width: 2 },
    yaxis: "y1",
  };

  layout = {
    shapes: [...lineasMaxMin1, linea_umbral1],
    title:
      "Número de Ciclos Usados: " +
      String(tMax1.length) +
      ", PPM = " +
      String(meanPPM1) +
      " ± " +
      String(stdPPM1),
    font: { family: "Arial, sans-serif", size: 18, color: "#000" },
    xaxis: { title: "Tiempo (s)" },
    yaxis: {
      title: scaled ? "ADC (Sigmas)" : "ADC (Voltios)",
    },
    side: "left",
    showgrid: false,
    zeroline: false,
  };
  const deltaT = xPoints[xPoints.length - 1] - xPoints[0];
  const samplingRate = xPoints.length / deltaT;

  document.getElementById("samplingRate").textContent =
    " Muestreo: " + samplingRate.toFixed(1) + " Hz";

  if (sensor1Button.style.backgroundColor !== "red") {
    Plotly.newPlot("plot_dataXY", [trace1], layout);
  }
}

async function disconnectSerial() {
  if (reader) {
    connectButton.value = "Conectar";
    connectButton.style.backgroundColor = "green";

    await reader.cancel();
    await port.close();

    isPortOpen = false;
  }
}
function clearPlot() {
  xPoints = [];
  y1Points = [];
  dataBuffer = [];
  lineBuffer = "";
  updatePlot();
}

function aboutBlock() {
  const elementOut = document.getElementById("aboutBlock");
  if (elementOut.style.display === "none") {
    elementOut.style.display = "block";
  } else {
    elementOut.style.display = "none";
  }
}

function buildBlock() {
  const elementOut = document.getElementById("buildBlock");
  if (elementOut.style.display === "none") {
    elementOut.style.display = "block";
  } else {
    elementOut.style.display = "none";
  }
}

function codeBlock() {
  const elementOut = document.getElementById("codeBlock");
  if (elementOut.style.display === "none") {
    elementOut.style.display = "block";
  } else {
    elementOut.style.display = "none";
  }
}

function processBlock() {
  const elementOut = document.getElementById("processBlock");
  if (elementOut.style.display === "none") {
    elementOut.style.display = "block";
  } else {
    elementOut.style.display = "none";
  }
}

function connectBlock() {
  const elementOut = document.getElementById("connectBlock");
  if (elementOut.style.display === "none") {
    elementOut.style.display = "block";
  } else {
    elementOut.style.display = "none";
  }
}

function detectMaximaMinima(y, t, umbral) {
  let maximos = [];
  let minimosAntes = [];
  let minimosDespues = [];

  let enZonaUmbral = false;
  let cruzoHaciaArriba = false;
  let valorMaximo = -Infinity;
  let tiemposMaximos = [];

  let valorMinimoAntes = Infinity;
  let tiempoMinimoAntes = null;
  let buscandoMinimoDespues = false;
  let valorMinimoDespues = Infinity;
  let tiempoMinimoDespues = null;

  for (let i = 1; i < y.length - 1; i++) {
    // Detectar mínimos locales
    if (y[i] <= y[i - 1] && y[i] < y[i + 1]) {
      if (!enZonaUmbral) {
        // Guardamos el mínimo antes de cruzar el umbral
        valorMinimoAntes = y[i];
        tiempoMinimoAntes = t[i];
      } else if (buscandoMinimoDespues) {
        // Guardamos el primer mínimo después del máximo
        valorMinimoDespues = y[i];
        tiempoMinimoDespues = t[i];
        buscandoMinimoDespues = false; // Dejar de buscar hasta el próximo máximo
      }
    }

    if (y[i] > umbral) {
      if (!enZonaUmbral && y[i - 1] <= umbral) {
        // Entramos en la zona del umbral viniendo de abajo
        enZonaUmbral = true;
        cruzoHaciaArriba = true;
        valorMaximo = y[i];
        tiemposMaximos = [t[i]];

        // Guardamos el mínimo antes del máximo
        minimosAntes.push(tiempoMinimoAntes);
      } else if (enZonaUmbral) {
        // Seguimos en la zona del umbral, verificamos si hay un nuevo máximo
        if (y[i] > valorMaximo) {
          valorMaximo = y[i];
          tiemposMaximos = [t[i]];
        } else if (y[i] === valorMaximo) {
          tiemposMaximos.push(t[i]);
        }
      }
    } else {
      if (enZonaUmbral) {
        // Salimos de la zona del umbral, almacenamos el promedio de los tiempos de los máximos
        if (cruzoHaciaArriba) {
          let promedioTiempoMaximo =
            tiemposMaximos.reduce((a, b) => a + b, 0) / tiemposMaximos.length;
          maximos.push(promedioTiempoMaximo);

          // Iniciar la búsqueda del mínimo después del máximo
          buscandoMinimoDespues = true;
          valorMinimoDespues = Infinity;
          tiempoMinimoDespues = null;
        }
        enZonaUmbral = false;
        cruzoHaciaArriba = false;
        valorMaximo = -Infinity;
        tiemposMaximos = [];
      }
    }
  }

  // Asegurar que las listas tengan la misma longitud
  while (minimosAntes.length < maximos.length) minimosAntes.push(null);
  while (minimosDespues.length < maximos.length) minimosDespues.push(null);

  return [minimosAntes, maximos, minimosDespues];
}

function movingAverage(arr, M) {
  if (arr.length < M) {
    console.error("El array es demasiado corto para calcular la media móvil.");
    return [];
  }

  let result = [];
  let sum = 0;

  // Calcular la suma inicial de los primeros M elementos
  for (let i = 0; i < M; i++) {
    sum += arr[i];
  }

  // Agregar la primera media móvil al resultado
  result.push(sum / M);

  // Usar una ventana deslizante para calcular las siguientes medias móviles
  for (let i = M; i < arr.length; i++) {
    sum += arr[i] - arr[i - M]; // Agregar el nuevo elemento y quitar el más antiguo
    result.push(sum / M);
  }

  return result;
}

function butterworthLowPass(signal, alpha) {
  let filtered = new Array(signal.length);
  filtered[0] = signal[0]; // Inicializar con el primer valor

  for (let i = 1; i < signal.length; i++) {
    filtered[i] = alpha * signal[i] + (1 - alpha) * filtered[i - 1];
  }

  return filtered;
}

function getMeanStDev(array) {
  const n = array.length;
  if (n > 1) {
    const mean = Math.round((10 * array.reduce((a, b) => a + b)) / n) / 10;
    const std =
      Math.round(
        10 *
          Math.sqrt(
            array.map((x) => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n
          )
      ) / 10;
    return [mean, std];
  } else {
    return [0, 0];
  }
}
function detectMaximaMinimaPrevio(y, t, umbral) {
  let maximos = [];
  let minimosAntes = [];
  let minimosDespues = [];

  let enZonaUmbral = false;
  let cruzoHaciaArriba = false;
  let valorMaximo = -Infinity;
  let tiemposMaximos = [];

  let valorMinimoAntes = Infinity;
  let tiempoMinimoAntes = null;
  let buscandoMinimoDespues = false;
  let valorMinimoDespues = Infinity;
  let tiempoMinimoDespues = null;

  for (let i = 1; i < y.length - 1; i++) {
    // Detectar mínimos locales
    if (y[i] <= y[i - 1] && y[i] < y[i + 1]) {
      if (!enZonaUmbral) {
        // Guardamos el mínimo antes de cruzar el umbral
        valorMinimoAntes = y[i];
        tiempoMinimoAntes = t[i];
      } else if (buscandoMinimoDespues) {
        // Guardamos el primer mínimo después del máximo
        valorMinimoDespues = y[i];
        tiempoMinimoDespues = t[i];
        buscandoMinimoDespues = false; // Dejar de buscar hasta el próximo máximo
      }
    }

    if (y[i] > umbral) {
      if (!enZonaUmbral && y[i - 1] <= umbral) {
        // Entramos en la zona del umbral viniendo de abajo
        enZonaUmbral = true;
        cruzoHaciaArriba = true;
        valorMaximo = y[i];
        tiemposMaximos = [t[i]];

        // Guardamos el mínimo antes del máximo
        minimosAntes.push(tiempoMinimoAntes);
      } else if (enZonaUmbral) {
        // Seguimos en la zona del umbral, verificamos si hay un nuevo máximo
        if (y[i] > valorMaximo) {
          valorMaximo = y[i];
          tiemposMaximos = [t[i]];
        } else if (y[i] === valorMaximo) {
          tiemposMaximos.push(t[i]);
        }
      }
    } else {
      if (enZonaUmbral) {
        // Salimos de la zona del umbral, almacenamos el promedio de los tiempos de los máximos
        if (cruzoHaciaArriba) {
          let promedioTiempoMaximo =
            tiemposMaximos.reduce((a, b) => a + b, 0) / tiemposMaximos.length;
          maximos.push(promedioTiempoMaximo);

          // Iniciar la búsqueda del mínimo después del máximo
          buscandoMinimoDespues = true;
          valorMinimoDespues = Infinity;
          tiempoMinimoDespues = null;
        }
        enZonaUmbral = false;
        cruzoHaciaArriba = false;
        valorMaximo = -Infinity;
        tiemposMaximos = [];
      }
    }
  }

  // Asegurar que las listas tengan la misma longitud
  while (minimosAntes.length < maximos.length) minimosAntes.push(null);
  while (minimosDespues.length < maximos.length) minimosDespues.push(null);

  return [minimosAntes, maximos];
}
function detectMaximaMinimaPosterior(y, t, umbral) {
  let maximos = [];
  let minimos = [];
  let enZonaUmbral = false;
  let cruzoHaciaArriba = false;
  let valorMaximo = -Infinity;
  let tiemposMaximos = [];
  let primerMaximoEncontrado = false;

  for (let i = 1; i < y.length; i++) {
    if (y[i] > umbral) {
      if (!enZonaUmbral && y[i - 1] <= umbral) {
        // Entramos en la zona del umbral desde abajo
        enZonaUmbral = true;
        cruzoHaciaArriba = true;
        valorMaximo = y[i];
        tiemposMaximos = [t[i]];
      } else if (enZonaUmbral) {
        // Seguimos en la zona del umbral, verificamos si hay un nuevo máximo
        if (y[i] > valorMaximo) {
          valorMaximo = y[i];
          tiemposMaximos = [t[i]];
        } else if (y[i] === valorMaximo) {
          tiemposMaximos.push(t[i]);
        }
      }
    } else {
      if (enZonaUmbral) {
        // Salimos de la zona del umbral, almacenamos el promedio de los tiempos máximos si cruzó hacia arriba
        if (cruzoHaciaArriba) {
          let promedioTiempoMaximo =
            tiemposMaximos.reduce((a, b) => a + b, 0) / tiemposMaximos.length;
          maximos.push(promedioTiempoMaximo);
          primerMaximoEncontrado = true; // Ya podemos registrar mínimos

          // Buscar el primer mínimo local DESPUÉS del máximo
          let minimoEncontrado = false;
          let posiblesMinimos = [];
          for (let j = i; j < y.length - 1; j++) {
            if (y[j] < y[j - 1] && y[j] < y[j + 1] && y[j] > 0) {
              minimos.push(t[j]); // Primer mínimo local después del máximo
              minimoEncontrado = true;
              break;
            } else if (y[j] === y[j + 1] && y[j] > 0) {
              posiblesMinimos.push(t[j]);
            } else if (posiblesMinimos.length > 0 && y[j] > y[j - 1]) {
              // Si ya acumulamos posibles mínimos y encontramos subida, tomamos el promedio
              let promedioTiempoMinimo =
                posiblesMinimos.reduce((a, b) => a + b, 0) /
                posiblesMinimos.length;
              minimos.push(promedioTiempoMinimo);
              minimoEncontrado = true;
              break;
            }
          }
          if (!minimoEncontrado) {
            // minimos.push(null);
          }
        }
        enZonaUmbral = false;
        cruzoHaciaArriba = false;
        valorMaximo = -Infinity;
        tiemposMaximos = [];
      }
    }
  }

  // Si el primer mínimo ocurre antes del primer máximo, lo eliminamos
  if (minimos.length > 0 && !primerMaximoEncontrado) {
    minimos.shift();
  }

  return [maximos, minimos];
}
function toggleSensor1() {
  if (sensor1Button.style.backgroundColor === "red") {
    sensor1Button.style.backgroundColor = "Aquamarine";
    sensor1Button.value = "Detener";
  } else {
    sensor1Button.style.backgroundColor = "red";
    sensor1Button.value = "Continuar";
  }
}
