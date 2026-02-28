(function () {
  "use strict";

  var ODOMETER_DIAGNOSTIC_ID = "DiagnosticOdometerId";
  var ODOMETER_ADJUSTMENT_DIAGNOSTIC_ID = "DiagnosticOdometerAdjustmentId";
  var ENGINE_HOURS_DIAGNOSTIC_ID = "DiagnosticEngineHoursId";
  var MYADMIN_URL = "https://myadmin.geotab.com/api/v1/MinedVehicleData/ByVins";
  var TOKEN_STORAGE_KEY = "odometro.myadmin.token";
  var REGION_STORAGE_KEY = "odometro.myadmin.region";
  var MODEL_ALERT_GPS_PCT = 20;

  function normalizeVin(vin) {
    if (!vin) return null;
    var normalized = String(vin).trim().toUpperCase();
    return normalized || null;
  }

  function metersToKm(value) {
    if (value === null || value === undefined) return null;
    return Number(value) / 1000;
  }

  function deviceOdometerToKm(value) {
    if (value === null || value === undefined) return null;
    var numeric = Number(value);
    return numeric > 1000000 ? numeric / 1000 : numeric;
  }

  function engineSecondsToHours(value) {
    if (value === null || value === undefined) return null;
    return Number(value) / 3600;
  }

  function fmtNumber(value, decimals) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
    return Number(value).toFixed(decimals);
  }

  function fmtDate(dateValue) {
    if (!dateValue) return "-";
    var date = new Date(dateValue);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleString();
  }

  function fmtAge(dateValue) {
    if (!dateValue) return "-";
    var date = new Date(dateValue);
    if (isNaN(date.getTime())) return "-";
    var deltaMs = Date.now() - date.getTime();
    if (deltaMs < 0) return "ahora";
    var minutes = Math.floor(deltaMs / 60000);
    var hours = Math.floor(minutes / 60);
    var days = Math.floor(hours / 24);
    if (days > 0) return "hace " + days + " dias";
    if (hours > 0) return "hace " + hours + " horas";
    if (minutes > 0) return "hace " + minutes + " min";
    return "hace <1 min";
  }

  function ageMinutes(dateValue) {
    if (!dateValue) return null;
    var date = new Date(dateValue);
    if (isNaN(date.getTime())) return null;
    return Math.floor((Date.now() - date.getTime()) / 60000);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setStatus(message) {
    var line = document.getElementById("statusLine");
    if (line) line.textContent = message;
  }

  function updateSummary(rows) {
    var odometerCount = 0;
    var odometerGpsCount = 0;
    var motorCount = 0;
    var motorGpsCount = 0;

    rows.forEach(function (row) {
      if (row.source === "ODOMETRO") odometerCount += 1;
      else odometerGpsCount += 1;

      if (row.engineSource === "MOTOR") motorCount += 1;
      else motorGpsCount += 1;
    });

    var c1 = document.getElementById("countOdometer");
    var c2 = document.getElementById("countGpsOdometer");
    var c3 = document.getElementById("countMotor");
    var c4 = document.getElementById("countGpsMotor");

    if (c1) c1.textContent = "ODOMETRO: " + odometerCount;
    if (c2) c2.textContent = "GPS: " + odometerGpsCount;
    if (c3) c3.textContent = "MOTOR: " + motorCount;
    if (c4) c4.textContent = "GPS: " + motorGpsCount;
  }

  function setActiveTab(tabName) {
    var odometerSection = document.getElementById("odometerSection");
    var engineSection = document.getElementById("engineSection");
    var tabOdometer = document.getElementById("tabOdometer");
    var tabEngine = document.getElementById("tabEngine");
    var odometerFilterWrap = document.getElementById("odometerFilterWrap");
    var engineFilterWrap = document.getElementById("engineFilterWrap");
    if (!odometerSection || !engineSection || !tabOdometer || !tabEngine) return;

    var showOdometer = tabName !== "engine";
    odometerSection.classList.toggle("hidden", !showOdometer);
    engineSection.classList.toggle("hidden", showOdometer);
    tabOdometer.classList.toggle("active", showOdometer);
    tabEngine.classList.toggle("active", !showOdometer);
    if (odometerFilterWrap) odometerFilterWrap.classList.toggle("hidden", !showOdometer);
    if (engineFilterWrap) engineFilterWrap.classList.toggle("hidden", showOdometer);
  }

  function chunkArray(values, size) {
    var chunks = [];
    for (var i = 0; i < values.length; i += size) {
      chunks.push(values.slice(i, i + size));
    }
    return chunks;
  }

  function createAddin() {
    var api = null;
    var state = {
      loaded: false,
      rows: [],
      filter: {
        brandModelQuery: "",
        odometerSource: "ALL",
        engineSource: "ALL",
      },
      sort: {
        key: "vehicle",
        direction: "asc",
      },
      engineSort: {
        key: "vehicle",
        direction: "asc",
      },
      modelSort: {
        key: "odometerGpsPct",
        direction: "desc",
      },
    };

    function apiGet(typeName, search, extra) {
      var params = {
        typeName: typeName,
        search: search || {},
      };
      if (extra) {
        Object.keys(extra).forEach(function (key) {
          params[key] = extra[key];
        });
      }
      return new Promise(function (resolve, reject) {
        api.call("Get", params, resolve, reject);
      });
    }

    async function getAll(typeName, search, extra) {
      var rows = await apiGet(typeName, search, Object.assign({ resultsLimit: 50000 }, extra || {}));
      return Array.isArray(rows) ? rows : [];
    }

    async function getLatestStatusByDevice(diagnosticId, fromDateIso, toDateIso) {
      var byDevice = Object.create(null);
      var cursor = fromDateIso;
      var pageSize = 50000;

      for (;;) {
        var rows = await getAll(
          "StatusData",
          {
            diagnosticSearch: { id: diagnosticId },
            fromDate: cursor,
            toDate: toDateIso,
          },
          {
            sort: { sortBy: "date", sortDirection: "Ascending" },
            resultsLimit: pageSize,
          }
        );

        if (!rows.length) break;
        for (var i = 0; i < rows.length; i += 1) {
          var row = rows[i];
          var deviceId = row && row.device && row.device.id;
          if (!deviceId) continue;
          byDevice[deviceId] = row;
        }

        if (rows.length < pageSize) break;
        var lastRow = rows[rows.length - 1];
        if (!lastRow || !lastRow.dateTime) break;
        var next = new Date(lastRow.dateTime);
        if (isNaN(next.getTime())) break;
        next = new Date(next.getTime() + 1);
        if (next.toISOString() <= cursor) break;
        if (next.toISOString() > toDateIso) break;
        cursor = next.toISOString();
      }

      return byDevice;
    }

    async function getPointStatusByDevice(diagnosticId, atIso) {
      var rows = await getAll(
        "StatusData",
        {
          diagnosticSearch: { id: diagnosticId },
          fromDate: atIso,
          toDate: atIso,
        },
        { resultsLimit: 50000 }
      );
      var byDevice = Object.create(null);
      rows.forEach(function (row) {
        var deviceId = row && row.device && row.device.id;
        if (!deviceId) return;
        byDevice[deviceId] = row;
      });
      return byDevice;
    }

    async function getSupportByVin(vins, token, regionId) {
      if (!token) return {};
      var cleanToken = token.trim().replace(/^Bearer\s+/i, "").replace(/^["']|["']$/g, "");
      if (!cleanToken) return {};

      var support = Object.create(null);
      var chunks = chunkArray(vins, 100);

      for (var i = 0; i < chunks.length; i += 1) {
        var response = await fetch(MYADMIN_URL, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + cleanToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            vins: chunks[i],
            regionId: regionId,
          }),
        });
        if (!response.ok) {
          throw new Error("MyAdmin ByVins error " + response.status);
        }
        var payload = await response.json();
        var items = Array.isArray(payload)
          ? payload
          : payload && (payload.result || payload.data || payload.items) || [];

        items.forEach(function (item) {
          if (!item || typeof item !== "object") return;
          var blocks = [item];
          if (item.minedVehicleDataOemEligibility && typeof item.minedVehicleDataOemEligibility === "object") {
            blocks.push(item.minedVehicleDataOemEligibility);
          }

          var vin = null;
          var make = null;
          var model = null;
          blocks.forEach(function (block) {
            vin = vin || block.vin || (block.vehicle && block.vehicle.vin) || null;
            make = make || block.make || null;
            model = model || block.model || null;
          });
          var nvin = normalizeVin(vin);
          if (!nvin) return;

          if (make || model) {
            support[nvin] = support[nvin] || {};
            support[nvin].brandModel = ((make || "") + " " + (model || "")).trim() || null;
          }

          var lists = [];
          blocks.forEach(function (block) {
            ["overallEngineDataResult", "topRequestFeatures", "capabilities", "supportedData"].forEach(function (k) {
              if (Array.isArray(block[k])) lists.push(block[k]);
            });
          });

          lists.forEach(function (list) {
            list.forEach(function (cap) {
              if (!cap || typeof cap !== "object") return;
              var source = String(cap.source || "").trim().toLowerCase();
              var code = String(cap.code || "").trim();
              var pct = cap.percentageSupported;
              if (pct === null || pct === undefined) return;
              support[nvin] = support[nvin] || {};
              if (source === "odometer" || code === "5") {
                support[nvin].odometer = Number(pct);
              }
              if (source.indexOf("engine operational time") >= 0 || code === "9") {
                support[nvin].engineHours = Number(pct);
              }
            });
          });
        });
      }

      return support;
    }

    function sortOdometerRows(rows) {
      var sorted = rows.slice();
      var key = state.sort.key;
      var direction = state.sort.direction === "desc" ? -1 : 1;
      sorted.sort(function (a, b) {
        var av = a[key];
        var bv = b[key];

        if (key === "dataDate") {
          av = av ? new Date(av).getTime() : -Infinity;
          bv = bv ? new Date(bv).getTime() : -Infinity;
        } else if (key === "ageMinutes") {
          av = a.ageMinutes == null ? Infinity : a.ageMinutes;
          bv = b.ageMinutes == null ? Infinity : b.ageMinutes;
        } else if (key === "odometerKm" || key === "odometerSupported") {
          av = av == null ? -Infinity : Number(av);
          bv = bv == null ? -Infinity : Number(bv);
        } else {
          av = String(av || "").toLowerCase();
          bv = String(bv || "").toLowerCase();
        }

        if (av < bv) return -1 * direction;
        if (av > bv) return 1 * direction;
        return 0;
      });
      return sorted;
    }

    function filterOdometerRows(rows) {
      var filtered = rows.slice();
      if (state.filter.brandModelQuery) {
        var query = state.filter.brandModelQuery.toLowerCase();
        filtered = filtered.filter(function (row) {
          return String(row.brandModel || "").toLowerCase().indexOf(query) >= 0;
        });
      }
      if (state.filter.odometerSource === "ALL") return filtered;
      return filtered.filter(function (row) {
        return row.source === state.filter.odometerSource;
      });
    }

    function updateOdometerHeaderSortUi() {
      var headers = document.querySelectorAll("#odometerTable thead th[data-sort-key]");
      headers.forEach(function (th) {
        var key = th.getAttribute("data-sort-key");
        var arrow = "";
        if (key === state.sort.key) {
          arrow = state.sort.direction === "asc" ? " ▲" : " ▼";
        }
        var baseLabel = th.textContent.replace(/[ ▲▼]+$/, "");
        th.textContent = baseLabel + arrow;
      });
    }

    function sortEngineRows(rows) {
      var sorted = rows.slice();
      var key = state.engineSort.key;
      var direction = state.engineSort.direction === "desc" ? -1 : 1;
      sorted.sort(function (a, b) {
        var av = a[key];
        var bv = b[key];

        if (key === "engineDate") {
          av = av ? new Date(av).getTime() : -Infinity;
          bv = bv ? new Date(bv).getTime() : -Infinity;
        } else if (key === "engineAgeMinutes") {
          av = a.engineAgeMinutes == null ? Infinity : a.engineAgeMinutes;
          bv = b.engineAgeMinutes == null ? Infinity : b.engineAgeMinutes;
        } else if (key === "engineHours" || key === "engineSupported") {
          av = av == null ? -Infinity : Number(av);
          bv = bv == null ? -Infinity : Number(bv);
        } else {
          av = String(av || "").toLowerCase();
          bv = String(bv || "").toLowerCase();
        }

        if (av < bv) return -1 * direction;
        if (av > bv) return 1 * direction;
        return 0;
      });
      return sorted;
    }

    function filterEngineRows(rows) {
      var filtered = rows.slice();
      if (state.filter.brandModelQuery) {
        var query = state.filter.brandModelQuery.toLowerCase();
        filtered = filtered.filter(function (row) {
          return String(row.brandModel || "").toLowerCase().indexOf(query) >= 0;
        });
      }
      if (state.filter.engineSource === "ALL") return filtered;
      return filtered.filter(function (row) {
        return row.engineSource === state.filter.engineSource;
      });
    }

    function updateEngineHeaderSortUi() {
      var headers = document.querySelectorAll("#engineTable thead th[data-engine-sort-key]");
      headers.forEach(function (th) {
        var key = th.getAttribute("data-engine-sort-key");
        var arrow = "";
        if (key === state.engineSort.key) {
          arrow = state.engineSort.direction === "asc" ? " ▲" : " ▼";
        }
        var baseLabel = th.textContent.replace(/[ ▲▼]+$/, "");
        th.textContent = baseLabel + arrow;
      });
    }

    function buildModelSummary(rows) {
      var byModel = Object.create(null);
      rows.forEach(function (row) {
        var model = (row.brandModel || "Sin marca/modelo").trim();
        if (!byModel[model]) {
          byModel[model] = {
            brandModel: model,
            total: 0,
            odometerCount: 0,
            odometerGpsCount: 0,
            motorCount: 0,
            motorGpsCount: 0,
            odometerGpsPct: 0,
            motorGpsPct: 0,
          };
        }
        var item = byModel[model];
        item.total += 1;
        if (row.source === "ODOMETRO") item.odometerCount += 1;
        else item.odometerGpsCount += 1;
        if (row.engineSource === "MOTOR") item.motorCount += 1;
        else item.motorGpsCount += 1;
      });

      var summary = Object.keys(byModel).map(function (key) {
        var item = byModel[key];
        item.odometerGpsPct = item.total ? (item.odometerGpsCount * 100) / item.total : 0;
        item.motorGpsPct = item.total ? (item.motorGpsCount * 100) / item.total : 0;
        return item;
      });
      return summary;
    }

    function sortModelSummary(rows) {
      var sorted = rows.slice();
      var key = state.modelSort.key;
      var direction = state.modelSort.direction === "desc" ? -1 : 1;
      sorted.sort(function (a, b) {
        var av = a[key];
        var bv = b[key];
        if (key === "brandModel") {
          av = String(av || "").toLowerCase();
          bv = String(bv || "").toLowerCase();
        } else {
          av = Number(av || 0);
          bv = Number(bv || 0);
        }
        if (av < bv) return -1 * direction;
        if (av > bv) return 1 * direction;
        return 0;
      });
      return sorted;
    }

    function updateModelHeaderSortUi() {
      var headers = document.querySelectorAll("#modelSummaryTable thead th[data-model-sort-key]");
      headers.forEach(function (th) {
        var key = th.getAttribute("data-model-sort-key");
        var arrow = "";
        if (key === state.modelSort.key) {
          arrow = state.modelSort.direction === "asc" ? " ▲" : " ▼";
        }
        var baseLabel = th.textContent.replace(/[ ▲▼]+$/, "");
        th.textContent = baseLabel + arrow;
      });
    }

    function renderModelSummary(rows) {
      var body = document.querySelector("#modelSummaryTable tbody");
      if (!body) return;
      var summaryRows = sortModelSummary(buildModelSummary(rows));
      updateModelHeaderSortUi();
      body.innerHTML = summaryRows
        .map(function (row) {
          var alertClass = row.odometerGpsPct > MODEL_ALERT_GPS_PCT ? "alert" : "";
          var encodedModel = encodeURIComponent(row.brandModel);
          return (
            "<tr class=\"" + alertClass + "\">" +
            "<td><span class=\"model-click\" data-brand-model=\"" + encodedModel + "\">" + escapeHtml(row.brandModel) + "</span></td>" +
            "<td>" + escapeHtml(String(row.total)) + "</td>" +
            "<td>" + escapeHtml(String(row.odometerCount)) + "</td>" +
            "<td>" + escapeHtml(String(row.odometerGpsCount)) + "</td>" +
            "<td>" + escapeHtml(fmtNumber(row.odometerGpsPct, 2) + "%") + "</td>" +
            "<td>" + escapeHtml(String(row.motorCount)) + "</td>" +
            "<td>" + escapeHtml(String(row.motorGpsCount)) + "</td>" +
            "<td>" + escapeHtml(fmtNumber(row.motorGpsPct, 2) + "%") + "</td>" +
            "</tr>"
          );
        })
        .join("");
    }

    function renderTables(rows) {
      var odometerBody = document.querySelector("#odometerTable tbody");
      var engineBody = document.querySelector("#engineTable tbody");
      if (!odometerBody || !engineBody) return;
      var odometerRows = sortOdometerRows(filterOdometerRows(rows));
      var engineRows = sortEngineRows(filterEngineRows(rows));
      updateOdometerHeaderSortUi();
      updateEngineHeaderSortUi();
      renderModelSummary(rows);

      odometerBody.innerHTML = odometerRows
        .map(function (row) {
          return (
            "<tr>" +
            "<td>" + escapeHtml(row.vehicle) + "</td>" +
            "<td>" + escapeHtml(row.brandModel || "-") + "</td>" +
            "<td>" + escapeHtml(row.source) + "</td>" +
            "<td>" + escapeHtml(fmtNumber(row.odometerKm, 2)) + "</td>" +
            "<td>" + escapeHtml(fmtAge(row.dataDate)) + "</td>" +
            "<td>" + escapeHtml(fmtDate(row.dataDate)) + "</td>" +
            "<td>" + escapeHtml(row.odometerSupported != null ? String(row.odometerSupported) : "-") + "</td>" +
            "</tr>"
          );
        })
        .join("");

      engineBody.innerHTML = engineRows
        .map(function (row) {
          return (
            "<tr>" +
            "<td>" + escapeHtml(row.vehicle) + "</td>" +
            "<td>" + escapeHtml(row.brandModel || "-") + "</td>" +
            "<td>" + escapeHtml(row.engineSource) + "</td>" +
            "<td>" + escapeHtml(fmtNumber(row.engineHours, 2)) + "</td>" +
            "<td>" + escapeHtml(fmtAge(row.engineDate)) + "</td>" +
            "<td>" + escapeHtml(fmtDate(row.engineDate)) + "</td>" +
            "<td>" + escapeHtml(row.engineSupported != null ? String(row.engineSupported) : "-") + "</td>" +
            "</tr>"
          );
        })
        .join("");
    }

    function downloadExcel() {
      if (!state.rows.length) {
        setStatus("No hay datos para exportar.");
        return;
      }
      if (!window.XLSX) {
        setStatus("No se pudo cargar XLSX para exportar.");
        return;
      }

      var odometerRows = state.rows.map(function (row) {
        return {
          vehiculo: row.vehicle,
          "marca modelo": row.brandModel || "",
          fuente: row.source,
          odometro_km: row.odometerKm,
          hace_cuanto: fmtAge(row.dataDate),
          fecha_dato: fmtDate(row.dataDate),
          Soportado: row.odometerSupported,
        };
      });

      var engineRows = state.rows.map(function (row) {
        return {
          vehiculo: row.vehicle,
          "marca modelo": row.brandModel || "",
          motor: row.engineSource,
          horas_motor: row.engineHours,
          hace_cuanto: fmtAge(row.engineDate),
          fecha_dato: fmtDate(row.engineDate),
          Soportado: row.engineSupported,
        };
      });

      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(odometerRows), "odometro");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(engineRows), "HorasMotor");
      XLSX.writeFile(wb, "reporte_odometro.xlsx");
    }

    async function loadData() {
      try {
        setStatus("Cargando datos desde primera conexion...");
        var tokenInput = document.getElementById("myadminToken");
        var regionInput = document.getElementById("regionId");

        var token = (tokenInput.value || "").trim();
        var regionId = Number(regionInput.value || "2");

        localStorage.setItem(REGION_STORAGE_KEY, String(regionId));
        if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);

        var toDate = new Date();
        var toIso = toDate.toISOString();

        var devices = await getAll("Device", {}, {});
        var minActiveFrom = null;
        devices.forEach(function (d) {
          if (!d || !d.activeFrom) return;
          var dt = new Date(d.activeFrom);
          if (isNaN(dt.getTime())) return;
          if (!minActiveFrom || dt < minActiveFrom) minActiveFrom = dt;
        });
        if (!minActiveFrom) {
          minActiveFrom = new Date("2000-01-01T00:00:00.000Z");
        }
        var fromIso = minActiveFrom.toISOString();

        var statusInfos = await getAll("DeviceStatusInfo", {}, {});

        var statusDateByDevice = Object.create(null);
        statusInfos.forEach(function (row) {
          var deviceId = row && row.device && row.device.id;
          if (!deviceId) return;
          statusDateByDevice[deviceId] = row.dateTime;
        });

        var odometerByDevice = await getLatestStatusByDevice(ODOMETER_DIAGNOSTIC_ID, fromIso, toIso);
        var engineByDevice = await getLatestStatusByDevice(ENGINE_HOURS_DIAGNOSTIC_ID, fromIso, toIso);
        var adjustmentByDevice = await getPointStatusByDevice(ODOMETER_ADJUSTMENT_DIAGNOSTIC_ID, toIso);

        var vins = [];
        devices.forEach(function (d) {
          var vin = normalizeVin(d.vehicleIdentificationNumber);
          if (vin) vins.push(vin);
        });
        vins = Array.from(new Set(vins)).sort();

        var supportByVin = {};
        if (token) {
          setStatus("Consultando soporte VIN en MyAdmin...");
          supportByVin = await getSupportByVin(vins, token, regionId);
        }

        var rows = devices.map(function (device) {
          var deviceId = device.id;
          var name = device.name || deviceId;
          var vin = normalizeVin(device.vehicleIdentificationNumber);
          var support = vin ? supportByVin[vin] || {} : {};

          var odometerRecent = odometerByDevice[deviceId];
          var source = odometerRecent ? "ODOMETRO" : "GPS";
          var odometerKm;
          var dataDate;
          if (odometerRecent) {
            odometerKm = metersToKm(odometerRecent.data);
            dataDate = odometerRecent.dateTime;
          } else {
            var adjustment = adjustmentByDevice[deviceId];
            if (adjustment && adjustment.data !== null && adjustment.data !== undefined) {
              odometerKm = metersToKm(adjustment.data);
            } else {
              odometerKm = deviceOdometerToKm(device.odometer);
            }
            dataDate = statusDateByDevice[deviceId] || null;
          }

          var engineRecent = engineByDevice[deviceId];

          return {
            vehicle: name,
            brandModel: support.brandModel || "",
            source: source,
            odometerKm: odometerKm,
            dataDate: dataDate,
            ageMinutes: ageMinutes(dataDate),
            odometerSupported: support.odometer,
            engineSource: engineRecent ? "MOTOR" : "GPS",
            engineHours: engineRecent ? engineSecondsToHours(engineRecent.data) : null,
            engineDate: engineRecent ? engineRecent.dateTime : null,
            engineAgeMinutes: ageMinutes(engineRecent ? engineRecent.dateTime : null),
            engineSupported: support.engineHours,
          };
        });

        rows.sort(function (a, b) {
          return a.vehicle.localeCompare(b.vehicle);
        });
        state.rows = rows;
        updateSummary(rows);
        renderTables(rows);
        setStatus("Listo. Filas: " + rows.length);
      } catch (error) {
        setStatus("Error: " + (error && error.message ? error.message : String(error)));
      }
    }

    function bindUi() {
      var refreshBtn = document.getElementById("refreshBtn");
      var downloadBtn = document.getElementById("downloadBtn");
      var tokenInput = document.getElementById("myadminToken");
      var regionInput = document.getElementById("regionId");
      var tabOdometer = document.getElementById("tabOdometer");
      var tabEngine = document.getElementById("tabEngine");
      var brandModelFilter = document.getElementById("brandModelFilter");
      var odometerSourceFilter = document.getElementById("odometerSourceFilter");
      var engineSourceFilter = document.getElementById("engineSourceFilter");
      var modelHeaders = document.querySelectorAll("#modelSummaryTable thead th[data-model-sort-key]");

      tokenInput.value = localStorage.getItem(TOKEN_STORAGE_KEY) || "";
      regionInput.value = localStorage.getItem(REGION_STORAGE_KEY) || "2";

      refreshBtn.addEventListener("click", loadData);
      downloadBtn.addEventListener("click", downloadExcel);
      if (tabOdometer) {
        tabOdometer.addEventListener("click", function () {
          setActiveTab("odometer");
        });
      }
      if (tabEngine) {
        tabEngine.addEventListener("click", function () {
          setActiveTab("engine");
        });
      }
      setActiveTab("odometer");

      if (brandModelFilter) {
        brandModelFilter.value = state.filter.brandModelQuery;
        brandModelFilter.addEventListener("input", function () {
          state.filter.brandModelQuery = (brandModelFilter.value || "").trim();
          renderTables(state.rows);
        });
      }

      if (odometerSourceFilter) {
        odometerSourceFilter.value = state.filter.odometerSource;
        odometerSourceFilter.addEventListener("change", function () {
          state.filter.odometerSource = odometerSourceFilter.value || "ALL";
          renderTables(state.rows);
        });
      }

      if (engineSourceFilter) {
        engineSourceFilter.value = state.filter.engineSource;
        engineSourceFilter.addEventListener("change", function () {
          state.filter.engineSource = engineSourceFilter.value || "ALL";
          renderTables(state.rows);
        });
      }

      var odometerHeaders = document.querySelectorAll("#odometerTable thead th[data-sort-key]");
      odometerHeaders.forEach(function (th) {
        th.style.cursor = "pointer";
        th.addEventListener("click", function () {
          var key = th.getAttribute("data-sort-key");
          if (!key) return;
          if (state.sort.key === key) {
            state.sort.direction = state.sort.direction === "asc" ? "desc" : "asc";
          } else {
            state.sort.key = key;
            state.sort.direction = "asc";
          }
          renderTables(state.rows);
        });
      });

      var engineHeaders = document.querySelectorAll("#engineTable thead th[data-engine-sort-key]");
      engineHeaders.forEach(function (th) {
        th.style.cursor = "pointer";
        th.addEventListener("click", function () {
          var key = th.getAttribute("data-engine-sort-key");
          if (!key) return;
          if (state.engineSort.key === key) {
            state.engineSort.direction = state.engineSort.direction === "asc" ? "desc" : "asc";
          } else {
            state.engineSort.key = key;
            state.engineSort.direction = "asc";
          }
          renderTables(state.rows);
        });
      });

      modelHeaders.forEach(function (th) {
        th.style.cursor = "pointer";
        th.addEventListener("click", function () {
          var key = th.getAttribute("data-model-sort-key");
          if (!key) return;
          if (state.modelSort.key === key) {
            state.modelSort.direction = state.modelSort.direction === "asc" ? "desc" : "asc";
          } else {
            state.modelSort.key = key;
            state.modelSort.direction = "desc";
          }
          renderModelSummary(state.rows);
        });
      });

      var modelSummaryBody = document.querySelector("#modelSummaryTable tbody");
      if (modelSummaryBody && brandModelFilter) {
        modelSummaryBody.addEventListener("click", function (event) {
          var target = event.target;
          if (!target || !target.classList || !target.classList.contains("model-click")) return;
          var encodedModel = target.getAttribute("data-brand-model") || "";
          var model = decodeURIComponent(encodedModel);
          brandModelFilter.value = model;
          state.filter.brandModelQuery = model;
          renderTables(state.rows);
          setStatus("Filtro marca modelo aplicado: " + model);
        });
      }
    }

    return {
      initialize: function (apiRef, _state, callback) {
        api = apiRef;
        bindUi();
        if (callback) callback();
      },
      focus: function () {
        if (!state.loaded) {
          state.loaded = true;
          loadData();
        }
      },
      blur: function () {},
    };
  }

  if (!window.geotab) window.geotab = {};
  if (!window.geotab.addin) window.geotab.addin = {};
  window.geotab.addin.odometroDashboard = createAddin;
})();
