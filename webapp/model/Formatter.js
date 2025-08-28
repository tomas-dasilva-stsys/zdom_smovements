sap.ui.define([], function () {
    "use strict";

    return {
        /**
         * Convierte una fecha al timezone de Portugal (Europe/Lisbon)
         * @param {string|Date} sDate Fecha proveniente del modelo
         * @returns {string} Fecha formateada para mostrar
         */
        formatDatePortugal: function (sDate) {
            if (!sDate) {
                return "";
            }

            let oDate = new Date(sDate);

            let oFormatter = new Intl.DateTimeFormat("es-PT", {
                timeZone: "Europe/Lisbon",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
            });

            return oFormatter.format(oDate);
        },

        /**
        * Convierte un string ISO 8601 duration (ej: PT12H34M42S) a formato hh:mm:ss AM/PM
        * @param {string} sDuration Cadena en formato ISO duration
        * @returns {string} Hora formateada con AM/PM
        */
        formatEdmTime: function (vMs) {
            if (vMs == null || vMs === "") {
                return "";
            }

            let ms = vMs.ms;
            if (isNaN(ms)) {
                return vMs;
            }

            // Pasar ms a horas, minutos, segundos
            let totalSeconds = Math.floor(ms / 1000);
            let hours = Math.floor(totalSeconds / 3600);
            let minutes = Math.floor((totalSeconds % 3600) / 60);
            let seconds = totalSeconds % 60;

            // AM/PM
            let period = hours >= 12 ? "PM" : "AM";

            let displayHours = hours % 12;
            if (displayHours === 0) {
                displayHours = 12;
            }

            let hh = displayHours.toString().padStart(2, "0");
            let mm = minutes.toString().padStart(2, "0");
            let ss = seconds.toString().padStart(2, "0");

            return `${hh}:${mm}:${ss} ${period}`;
        }
    };
});
