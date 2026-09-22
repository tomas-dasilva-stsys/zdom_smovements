sap.ui.define([
    "zdomscrapmovements/controller/BaseController",
    "zdomscrapmovements/model/Formatter",
    "sap/m/p13n/Engine",
    "sap/m/p13n/SelectionController",
    "sap/m/table/ColumnWidthController",
    "sap/m/p13n/MetadataHelper"
], function (
    BaseController,
    Formatter,
    Engine,
    SelectionController,
    ColumnWidthController,
    MetadataHelper
) {
    "use strict";

    return BaseController.extend("zdomscrapmovements.controller.UcDetail", {

        formatter: Formatter,

        onInit: function () {
            BaseController.prototype.onInit.apply(this, arguments);

            this.getOwnerComponent().getRouter().getRoute("ucDetail").attachPatternMatched(this._onRouteMatched, this);
            Engine.getInstance().attachStateChange((oEvent) => this._onP13nStateChange(oEvent));
            this._initP13n();
        },

        _initP13n: function () {
            const oTable = this.byId("table");

            const aColumnsMetadata = oTable.getColumns().map((oColumn) => {
                return {
                    key: oColumn.data("p13nKey"),
                    label: oColumn.getHeader().getText()
                };
            });

            this._oMetadataHelper = new MetadataHelper(aColumnsMetadata);

            Engine.getInstance().register(oTable, {
                helper: this._oMetadataHelper,
                controller: {
                    Columns: new SelectionController({
                        control: oTable,
                        targetAggregation: "columns",
                        getKeyForItem: (oCol) => oCol.getVisible() ? oCol.data("p13nKey") : null
                    }),
                    ColumnWidth: new ColumnWidthController({
                        control: oTable,
                        targetAggregation: "columns"
                    })
                }
            });
        },

        _onP13nStateChange: async function (oEvent) {
            const oTable = this.byId("table");

            if (oEvent.getParameter("control") !== oTable) {
                return;
            }

            if (this._bApplyingColumnOrder) {
                return;
            }

            const oState = await Engine.getInstance().retrieveState(oTable);

            if (!oState?.Columns) {
                return;
            }

            const aColumnKeys = oState.Columns.map(oColumn => oColumn.key).filter(Boolean);

            console.log("Nuevo orden:", aColumnKeys);

            this._applyColumnOrder(aColumnKeys);
        },

        _applyColumnOrder: function (aColumnKeys) {
            const oTable = this.byId("table");

            this._bApplyingColumnOrder = true;

            try {
                // 1. Reordenar las columnas
                const aColumns = oTable.getColumns();
                aColumnKeys.forEach((sKey, iTargetIndex) => {
                    const oColumn = aColumns.find(oCol => oCol.data("p13nKey") === sKey);
                    if (!oColumn) return;
                    const iCurrentIndex = oTable.indexOfColumn(oColumn);
                    if (iCurrentIndex !== iTargetIndex) {
                        oTable.removeColumn(oColumn);
                        oTable.insertColumn(oColumn, iTargetIndex);
                    }
                });

                // 2. Reordenar las cells DEL TEMPLATE 
                const oBindingInfo = oTable.getBindingInfo("items");
                if (!oBindingInfo || !oBindingInfo.template) return;

                const oTemplate = oBindingInfo.template;
                const aTemplateCells = oTemplate.getCells();
                const mCellsByKey = {};
                aTemplateCells.forEach(oCell => {
                    const sKey = oCell.data("p13nKey");
                    if (sKey) mCellsByKey[sKey] = oCell;
                });

                const aOrderedCells = aColumnKeys.map(sKey => mCellsByKey[sKey]).filter(Boolean);

                oTemplate.removeAllCells();
                aOrderedCells.forEach(oCell => oTemplate.addCell(oCell));

                // 3. Mutar el template no alcanza para los items ya
                //    instanciados. Hay que forzar la recreación completa.
                oTable.unbindItems();
                oTable.bindItems(oBindingInfo);

            } finally {
                this._bApplyingColumnOrder = false;
            }
        },

        onP13nButtonPress: function (oEvent) {
            const oTable = this.byId("table");
            // Podés abrir solo "Columns", o agregar "ColumnWidth" si querés
            // que el ancho también sea ajustable desde el mismo diálogo
            Engine.getInstance().show(oTable, ["Columns"], {
                title: "Ajustes de columnas",
                source: oEvent.getSource()
            });
        },

        onNavBack: function () {
            const oTable = this.byId("table");

            this.getOwnerComponent().getRouter().navTo("main");
            Engine.getInstance().reset(oTable, "Columns");
        },

        _onRouteMatched: function (oEvent) {
            const oArgs = oEvent.getParameter("arguments");
            // const oView = this.getView();
            // oView.bindElement({
            //     path: "/selectedData/" + oArgs.index
            // });
        }
    });
});