sap.ui.define([], function () {
    "use strict";

    const mLocaleToTZ = {
        "pt-PT": "Europe/Lisbon",
        "en-US": "Europe/Lisbon",
        "es-ES": "Europe/Madrid",
    };

    function getTimeZoneForLocale(sLocale) {
        // Si viene con región, lo buscamos directo
        if (mLocaleToTZ[sLocale]) {
            return mLocaleToTZ[sLocale];
        }

        // Si solo viene idioma (ej: "es"), buscamos el default
        let lang = sLocale.split("-")[0];
        if (lang === "pt") return "Europe/Lisbon";
        if (lang === "en") return "Europe/Lisbon";
        if (lang === "es") return "Europe/Madrid";

        // Si no se encuentra → UTC
        return "UTC";
    }

    return {
        formatDateByLocale: function (sDate) {
            if (!sDate) return "";

            let oDate = new Date(sDate);
            let sLocale = sap.ui.getCore().getConfiguration().getLanguage();
            let sTimeZone = getTimeZoneForLocale(sLocale.toLowerCase());

            return new Intl.DateTimeFormat("es-ES", {
                timeZone: sTimeZone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
            }).format(oDate);
        },

        formatNotificationCreationDate: function (sDate) {
            if (!sDate) return "";

            let oDate;
            if (sDate instanceof Date) {
                oDate = sDate
            }

            const year = parseInt(sDate.substring(0, 4), 10);
            const month = parseInt(sDate.substring(4, 6), 10) - 1; // Mes base 0
            const day = parseInt(sDate.substring(6, 8), 10);
            oDate = new Date(year, month, day);

            const finalYear = oDate.getFullYear();
            const finalMonth = String(oDate.getMonth() + 1).padStart(2, "0");
            const finalDay = String(oDate.getDate()).padStart(2, "0");

            return `${finalDay}/${finalMonth}/${finalYear}`;
        },

        formatEdmTimeByLocale: function (vMs) {
            if (vMs == null || vMs === "") {
                return "";
            }

            let ms = typeof vMs === "object" ? vMs.ms : vMs;
            if (isNaN(ms)) {
                return vMs;
            }

            // Crear fecha en UTC
            // let oDate = new Date(ms);

            // Detectar locale
            // let sLocale = sap.ui.getCore().getConfiguration().getLanguage();
            // let sTimeZone = sap.ui.getCore().getConfiguration().getTimezone()

            // Formatear según timezone
            // let formatter = new Intl.DateTimeFormat(sLocale, {
            //     timeZone: sTimeZone,
            //     hour: "2-digit",
            //     minute: "2-digit",
            //     second: "2-digit",
            //     hour12: false
            // });

            // return formatter.format(oDate);

            // Pasar ms a horas, minutos, segundos
            let totalSeconds = Math.floor(ms / 1000);
            let hours = Math.floor(totalSeconds / 3600);
            let minutes = Math.floor((totalSeconds % 3600) / 60);
            let seconds = totalSeconds % 60;

            let hh = hours.toString().padStart(2, "0");
            let mm = minutes.toString().padStart(2, "0");
            let ss = seconds.toString().padStart(2, "0");

            return `${hh}:${mm}:${ss}`;
        }
    };
});
