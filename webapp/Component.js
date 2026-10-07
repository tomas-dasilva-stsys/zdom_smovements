/**
 * eslint-disable @sap/ui5-jsdocs/no-jsdoc
 */

sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/Device",
    "zdomscrapmovements/model/models",
    "zdomscrapmovements/utils/FioriComponent",
    "sap/ui/model/json/JSONModel"
],
    function (UIComponent,
	Device,
	models,
	FioriComponent,
	JSONModel) {
        "use strict";

        return UIComponent.extend("zdomscrapmovements.Component", {
            metadata: {
                manifest: "json"
            },

            /**
             * The component is initialized by UI5 automatically during the startup of the app and calls the init method once.
             * @public
             * @override
             */
            init: function () {
                // call the base component's init function
                UIComponent.prototype.init.apply(this, arguments);

                // Obtener el modelo de recursos (i18n)
                let oResourceBundle = this.getModel("i18n").getResourceBundle();

                // Obtener el texto del título desde el archivo i18n
                let sAppTitle = oResourceBundle.getText("appTitle");

                // Establecer el título del documento
                document.title = sAppTitle;

                this.setModel(new JSONModel({ selectedData: [], parentRows: [] }), "ucDetailModel");

                // enable routing
                this.getRouter().initialize();

                FioriComponent.setComponent(this);

                // set the device model
                this.setModel(models.createDeviceModel(), "device");
            }
        });
    }
);