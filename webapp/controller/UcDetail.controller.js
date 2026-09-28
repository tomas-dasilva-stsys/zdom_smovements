sap.ui.define([
    "zdomscrapmovements/controller/BaseController",
    "zdomscrapmovements/model/Formatter",
], function (
    BaseController,
    Formatter,
) {
    "use strict";

    return BaseController.extend("zdomscrapmovements.controller.UcDetail", {

        formatter: Formatter,

        onInit: function () {
            BaseController.prototype.onInit.apply(this, arguments);

            this._oTable = this.byId("table");
            this.getOwnerComponent().getRouter().getRoute("ucDetail").attachPatternMatched(this._onRouteMatched, this);
        },

        onNavBack: async function () {
            const oTable = this.byId("table");

            this.getOwnerComponent().getRouter().navTo("main");
        },

        _onRouteMatched: async function (oEvent) {
            
        },

        onExportExcel: function() {
            const oTable = this.byId("table");
            this.exportTableToExcel(oTable, "ucDetails.xls", {});
        }
    });
});