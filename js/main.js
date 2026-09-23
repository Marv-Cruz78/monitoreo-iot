// ==========================================
// CONFIGURACIÓN DE INFLUXDB CLOUD
// ==========================================
const INFLUX_URL = "https://us-east-1-1.aws.cloud2.influxdata.com";
const INFLUX_ORG = "d410890ae6ba7304"; 
const INFLUX_BUCKET = "Sensor";
// Reemplaza esta cadena con tu Token de InfluxDB Cloud si aún no lo has colocado
const INFLUX_TOKEN = "T06bkT86mJlP7SU1LZkb5HfY3Ogl3K_cHjJvU8tLAjzJ5wp3ut3TCY6wj17mXcjii8aJWLIiYli2SmZFcE15Dg=="; 

// ==========================================
// INICIALIZACIÓN DE CHART.JS
// ==========================================
const ctx = document.getElementById('graficoSensor').getContext('2d');
const chart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      {
        label: 'Temperatura (°C)',
        borderColor: '#ff5252',
        backgroundColor: 'rgba(255, 82, 82, 0.15)',
        data: [],
        fill: true,
        tension: 0.3
      },
      {
        label: 'Humedad (%)',
        borderColor: '#00e5ff',
        backgroundColor: 'rgba(0, 229, 255, 0.15)',
        data: [],
        fill: true,
        tension: 0.3
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false, // Permite expandirse a todo el ancho y alto asignado en CSS
    plugins: {
      legend: {
        labels: { color: '#f8fafc' }
      }
    },
    scales: {
      x: { 
        display: true, 
        ticks: { 
          color: '#94a3b8',
          maxTicksLimit: 10 // Limita las horas mostradas abajo para evitar amontonamiento
        },
        grid: { color: 'rgba(255, 255, 255, 0.05)' }
      },
      y: { 
        beginAtZero: false,
        ticks: { color: '#94a3b8' },
        grid: { color: 'rgba(255, 255, 255, 0.05)' }
      }
    }
  }
});

// ==========================================
// CONSULTA A INFLUXDB VIA API REST
// ==========================================
async function obtenerDatosInflux() {
  // Consulta los últimos 15 minutos (-15m)
  const queryFlux = `from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -15m)
  |> filter(fn: (r) => r["_measurement"] == "ambiente")
  |> filter(fn: (r) => r["_field"] == "temperatura" or r["_field"] == "humedad")`;

  try {
    const response = await fetch(`${INFLUX_URL}/api/v2/query?org=${INFLUX_ORG}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${INFLUX_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/csv'
      },
      body: JSON.stringify({
        query: queryFlux,
        type: 'flux'
      })
    });

    if (!response.ok) {
      console.error("Error al consultar InfluxDB. Estado HTTP:", response.status);
      return;
    }

    const csvData = await response.text();
    procesarRespuestaCSV(csvData);

  } catch (error) {
    console.error("Error de red/conexión con InfluxDB:", error);
  }
}

// ==========================================
// PROCESAMIENTO Y PARSEO DE CSV
// ==========================================
function procesarRespuestaCSV(csv) {
  const lineas = csv.trim().split('\n');
  const mapaLecturas = {};

  let idxTime = -1;
  let idxValue = -1;
  let idxField = -1;

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i].trim();
    if (!linea) continue;

    // Detectar dinámicamente los índices de columna
    if (linea.startsWith(',result,table')) {
      const headers = linea.split(',');
      idxTime = headers.indexOf('_time');
      idxValue = headers.indexOf('_value');
      idxField = headers.indexOf('_field');
      continue;
    }

    // Ignorar comentarios
    if (linea.startsWith('#')) continue;

    const col = linea.split(',');

    if (idxTime !== -1 && idxValue !== -1 && idxField !== -1 && col.length > idxField) {
      const tiempoBruto = col[idxTime];
      const valor = parseFloat(col[idxValue]);
      const campo = col[idxField] ? col[idxField].trim() : '';

      if (tiempoBruto && !isNaN(valor) && (campo === 'temperatura' || campo === 'humedad')) {
        const fecha = new Date(tiempoBruto);
        const horaFormateada = !isNaN(fecha.getTime()) 
          ? fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) 
          : '';

        if (horaFormateada) {
          if (!mapaLecturas[horaFormateada]) {
            mapaLecturas[horaFormateada] = { temp: null, hum: null };
          }

          if (campo === 'temperatura') mapaLecturas[horaFormateada].temp = valor;
          if (campo === 'humedad') mapaLecturas[horaFormateada].hum = valor;
        }
      }
    }
  }

  const horas = Object.keys(mapaLecturas);
  const temps = horas.map(h => mapaLecturas[h].temp);
  const hums = horas.map(h => mapaLecturas[h].hum);

  // Actualizar indicadores numéricos en pantalla
  if (horas.length > 0) {
    const ultimasTemps = temps.filter(v => v !== null);
    const ultimasHums = hums.filter(v => v !== null);

    if (ultimasTemps.length > 0) {
      document.getElementById('tempActual').innerText = `${ultimasTemps[ultimasTemps.length - 1].toFixed(1)} °C`;
    }
    if (ultimasHums.length > 0) {
      document.getElementById('humActual').innerText = `${ultimasHums[ultimasHums.length - 1].toFixed(1)} %`;
    }
  }

  // Actualizar gráfica en tiempo real
  chart.data.labels = horas;
  chart.data.datasets[0].data = temps;
  chart.data.datasets[1].data = hums;
  chart.update();
}

// Ejecución inicial e intervalo de actualización
obtenerDatosInflux();
setInterval(obtenerDatosInflux, 5000);