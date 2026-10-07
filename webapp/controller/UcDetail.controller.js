sap.ui.define([
    "zdomscrapmovements/controller/BaseController",
    "zdomscrapmovements/model/Formatter",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast"
], function (
    BaseController,
    Formatter,
    JSONModel,
    Filter,
    FilterOperator,
    MessageToast,
) {
    "use strict";

    return BaseController.extend("zdomscrapmovements.controller.UcDetail", {

        formatter: Formatter,

        onInit: function () {
            BaseController.prototype.onInit.apply(this, arguments);

            this._oTable = this.byId("table");
            this.getOwnerComponent().getRouter().getRoute("ucDetail").attachPatternMatched(this._onRouteMatched, this);

            this._sScanBuffer = "";
            this._iLastKeyTime = 0;
            this._fnKeyHandler = this._onGlobalKeyDown.bind(this);
            document.addEventListener("keydown", this._fnKeyHandler, true);
        },

        onExit: function () {
            document.removeEventListener("keydown", this._fnKeyHandler, true);
        },

        onNavBack: async function () {
            const oTable = this.byId("table");
            this.clearNotificationsPanel();
            // this.onExit();

            oTable.clearSelection();

            this.getOwnerComponent().getRouter().navTo("main");
        },

        _onRouteMatched: async function (oEvent) {
            const tableData = this.getOwnerComponent().getModel("ucDetailModel").getData().selectedData;
            const currSerialNumbers = tableData.map(row => row.Serid).filter(serid => serid && serid.trim() !== "");

            let serNumbersData = {}

            currSerialNumbers.forEach((serid, index) => {
                serNumbersData[index] = { key: index, serialNumber: serid };
            });

            const serNumbersModel = new JSONModel({ serialNumbers: Object.values(serNumbersData) });

            this.getOwnerComponent().setModel(serNumbersModel, "serNumbersModel");
        },

        _onGlobalKeyDown: function (oEvent) {
            const MAX_DELAY = 100;   // ms entre caracteres
            const MIN_LENGTH = 3;
            const iNow = Date.now();

            if (!this.getView().getDomRef() || !this.getView().$().is(":visible")) {
                return;
            }

            // Enter / Tab: cierre del escaneo. NO se evalúa el delay
            if (oEvent.key === "Enter" || oEvent.key === "Tab") {
                if (this._sScanBuffer.length >= MIN_LENGTH) {
                    oEvent.preventDefault();
                    oEvent.stopPropagation();
                    const sCode = this._sScanBuffer;
                    this._sScanBuffer = "";
                    this._onBarcodeScanned(sCode);
                } else {
                    this._sScanBuffer = "";
                }
                return;
            }

            // Caracteres imprimibles: acá sí se controla la velocidad
            if (oEvent.key.length === 1) {
                if (iNow - this._iLastKeyTime > MAX_DELAY) {
                    this._sScanBuffer = "";   // tipeo humano: reiniciar
                }
                this._iLastKeyTime = iNow;
                this._sScanBuffer += oEvent.key;
            }
        },

        _onBarcodeScanned: function (sCode) {
            const oResourceBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();
            const oTable = this.byId("table");
            const oBinding = oTable.getBinding("rows");
            if (!oBinding) { return; }

            const sClean = sCode.trim().replace(/^0+/, "");   // sin ceros a la izquierda

            // getContexts respeta filtros/orden activos de la tabla
            const aContexts = oBinding.getContexts(0, oBinding.getLength());

            const iIndex = aContexts.findIndex(function (oCtx) {
                const oRow = oCtx && oCtx.getObject();
                if (!oRow) { return false; }
                const sHu = String(oRow.HandlingUnit || "").replace(/^0+/, "");
                const sHuId = String(oRow.HuIdentification || "").replace(/^0+/, "");
                return sHu === sClean || sHuId === sClean;
            });

            if (iIndex === -1) {
                MessageToast.show(oResourceBundle.getText("noHuFound", [sCode]));
                return;
            }

            // Quitar foco de cualquier input para que no quede basura escrita
            if (document.activeElement && document.activeElement.blur) {
                document.activeElement.blur();
            }

            // Contexto de la fila encontrada (su path es el índice REAL en el array)
            const oFoundCtx = aContexts[iIndex];
            this._moveRowToTopAndSelect(oFoundCtx);

            sap.m.MessageToast.show(oResourceBundle.getText("huSelected", [sCode]));
        },

        _moveRowToTopAndSelect: function (oFoundCtx) {
            const oTable = this.byId("table");
            const oModel = this.getView().getModel("ucDetailModel");
            const aData = oModel.getProperty("/selectedData");

            const oFoundRow = oFoundCtx.getObject();

            // 1. Guardar los objetos que ya estaban seleccionados (para no perder la selección)
            const aSelectedRows = oTable.getSelectedIndices().map(function (i) {
                const oCtx = oTable.getContextByIndex(i);
                return oCtx && oCtx.getObject();
            }).filter(Boolean);

            if (aSelectedRows.indexOf(oFoundRow) === -1) {
                aSelectedRows.push(oFoundRow);
            }

            // 2. Reordenar: sacar la fila y ponerla primera
            const iRealIndex = aData.indexOf(oFoundRow);
            if (iRealIndex > 0) {
                aData.splice(iRealIndex, 1);
                aData.unshift(oFoundRow);
                oModel.setProperty("/selectedData", aData);   // refresca el binding
            }

            // 3. Volver a marcar las filas según su nueva posición
            oTable.clearSelection();
            const aNewData = oModel.getProperty("/selectedData");
            aSelectedRows.forEach(function (oRow) {
                const iNewIdx = aNewData.indexOf(oRow);
                if (iNewIdx !== -1) {
                    oTable.addSelectionInterval(iNewIdx, iNewIdx);
                }
            });

            // 4. Scroll arriba
            oTable.setFirstVisibleRow(0);
        },

        checkForSerialNumbers: async function () {
            const scrapErr = this.checkTransferMovement();
            if (!scrapErr) return;

            const oTable = this.byId("table");
            const aSelectedRows = this._getSelectedData(oTable);
            const aLines = aSelectedRows.filter(row =>
                row.Serid && row.Serid.trim() !== "" &&
                Number(row.BlockedStock) != Number(row.ScrapQuantity) &&
                Number(row.BlockedStock) != Number(row.FreeQuantity)
            ).map((row, index) => ({
                lineKey: this._buildLineKey(index, row.ItemNumber, row.Lgort),
                component: row.parent.Component,
                scrapQty: Number(row.ScrapQuantity || 0),
                freeQty: Number(row.FreeQuantity || 0)
            }));

            const partialMove = aSelectedRows.some(row => {
                return Number(row.BlockedStock) != Number(row.ScrapQuantity) && Number(row.BlockedStock) != Number(row.FreeQuantity);
            });

            // if (hasSerialNumbers && partialMove) {
            //     const iScrap = aSelectedRows.reduce((sum, r) => sum + Number(r.ScrapQuantity || 0), 0);
            //     const iFree = aSelectedRows.reduce((sum, r) => sum + Number(r.FreeQuantity || 0), 0);
            //     this._openSerialNumbersDialog(iScrap, iFree);
            // } else {
            //     this.openPrintLabels({});
            // }

            if (aLines.length && partialMove) {
                this._openSerialNumbersDialog(aLines);
            } else {
                this.openPrintLabels({});
            }
        },

        _openSerialNumbersDialog: async function (aLines) {
            const aAllSerials = this.getOwnerComponent().getModel("serNumbersModel").getProperty("/serialNumbers");

            const createItems = (qtyKey) => aLines.flatMap(line =>
                Array.from({ length: line[qtyKey] }, () => ({
                    lineKey: line.lineKey,
                    component: line.component,
                    serialNumber: "",
                    valueState: "None"
                }))
            );

            const aScrapItems = createItems("scrapQty");
            const aFreeItems = createItems("freeQty");

            const oModel = new JSONModel({
                allSerials: aAllSerials,
                available: [],
                scrapItems: aScrapItems,
                freeItems: aFreeItems,
                scrapVisible: aScrapItems.length > 0,
                freeVisible: aFreeItems.length > 0
            });

            const oDialog = await this.getFragment("SerialNumbersDialog");
            oDialog.setModel(oModel, "serialModel");
            oDialog.open();
        },

        onSerialValueHelp: async function (oEvent) {
            const oInput = oEvent.getSource();
            const oModel = oInput.getModel("serialModel");
            const oCurrentItem = oInput.getBindingContext("serialModel").getObject();

            this._oCurrentInput = oInput;

            // Serial numbers ya elegidos en OTROS inputs
            const aTaken = [...oModel.getProperty("/scrapItems"), ...oModel.getProperty("/freeItems")]
                .filter(item => item !== oCurrentItem && item.serialNumber)
                .map(item => item.serialNumber);

            const aAvailable = oModel.getProperty("/allSerials").filter(s => !aTaken.includes(s.serialNumber));

            oModel.setProperty("/available", aAvailable);

            const oHelpDialog = await this.getFragment("SerialNumbersHelpDialog");
            oHelpDialog.setModel(oModel, "serialModel");
            oHelpDialog.open();
        },

        onSearch: function (oEvent) {
            const sValue = oEvent.getParameter("value");
            const aFilters = sValue ? [new Filter("serialNumber", FilterOperator.Contains, sValue)] : [];
            oEvent.getSource().getBinding("items").filter(aFilters);
        },

        _validateSerialInput: function (oInput) {
            const oResourceBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();
            const oSerialModel = oInput.getModel("serialModel");
            const sValue = (oInput.getValue() || "").trim();
            const oContext = oInput.getBindingContext("serialModel");
            const sCurrPath = oContext ? oContext.getPath() : null;

            const setError = (sTextKey) => {
                oInput.setValueState("Error");
                oInput.setValueStateText(oResourceBundle.getText(sTextKey, [sValue]));
                return false;
            };

            // 1. Vacío
            if (!sValue) {
                return setError("serialNumberEmpty");
            }

            // 2. Existe en el value help
            const aValidSerials = oSerialModel.getProperty("/allSerials") || [];
            const bExists = aValidSerials.some(
                (oSerial) => (oSerial.serialNumber ?? oSerial) === sValue
            );
            if (!bExists) {
                return setError("serialNumberInvalid");
            }

            // 3. Repetido en otro input (excluyendo el propio)
            const aFree = oSerialModel.getProperty("/freeItems") || [];
            const aScrap = oSerialModel.getProperty("/scrapItems") || [];
            const aAllItems = [
                ...aFree.map((oItem, i) => ({ path: `/freeItems/${i}`, serial: oItem.serialNumber })),
                ...aScrap.map((oItem, i) => ({ path: `/scrapItems/${i}`, serial: oItem.serialNumber }))
            ];
            const bRepeated = aAllItems.some(
                (oItem) => oItem.path !== sCurrPath && oItem.serial === sValue
            );
            if (bRepeated) {
                return setError("serialNumberRepited");
            }

            // 4. Válido
            oInput.setValueState("None");
            oInput.setValueStateText("");
            return true;
        },

        _getSerialInputs: function () {
            return this.getView().findAggregatedObjects(true, (oCtrl) => {
                const oBinding = oCtrl.isA("sap.m.Input") && oCtrl.getBinding("value");
                return oBinding && oBinding.getPath() === "serialNumber"; // <-- ajusta al path de tu binding
            });
        },

        onSerialInputChange: function (oEvent) {
            const oCurrInput = oEvent.getSource();
            this._validateSerialInput(oCurrInput);

            // Re-valida los otros inputs que estaban en error (por ejemplo, un duplicado que ya se corrigió)
            this._getSerialInputs()
                .filter((oInput) => oInput !== oCurrInput && oInput.getValueState() === "Error")
                .forEach((oInput) => this._validateSerialInput(oInput));
        },

        onConfirmSerialNumbers: function (oEvent) {
            const oResourceBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();
            const aResults = this._getSerialInputs().map((oInput) => this._validateSerialInput(oInput));
            const bAllValid = aResults.every(Boolean);

            if (!bAllValid) {
                const oResourceBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();
                MessageToast.show(oResourceBundle.getText("serialNumbersInvalid"));
                return;
            }

            const oDialog = oEvent.getSource().getParent();
            const oModel = oDialog.getModel("serialModel");
            const aScrap = oModel.getProperty("/scrapItems");
            const aFree = oModel.getProperty("/freeItems");

            oModel.refresh(true);

            const groupByLine = (items) => items.reduce((acc, i) => {
                (acc[i.lineKey] = acc[i.lineKey] || []).push(i.serialNumber);
                return acc;
            }, {});

            const serialNumbersPayload = {
                scrapSerials: groupByLine(aScrap),
                freeSerials: groupByLine(aFree)
            };

            oDialog.close();
            this.openPrintLabels(serialNumbersPayload);
        },

        // _buildLineKey: function (component, itemNumber, charg, lgort) {
        //     return [component, itemNumber, charg, lgort].map(v => String(v ?? "").trim()).join("|");
        // },

        onValueHelpDialogClose: function (oEvent) {
            const oSelectedItem = oEvent.getParameter("selectedItem");

            if (oSelectedItem && this._oCurrentInput) {
                const oModel = this._oCurrentInput.getModel("serialModel");
                const sPath = this._oCurrentInput.getBindingContext("serialModel").getPath();
                oModel.setProperty(sPath + "/serialNumber", oSelectedItem.getTitle());
                oModel.setProperty(sPath + "/valueState", "None");
            }

            // limpiar filtro de búsqueda para la próxima apertura
            const oBinding = oEvent.getSource().getBinding("items");
            if (oBinding) {
                oBinding.filter([]);
            }
        },

        onCancelSerialNumbers: function (oEvent) {
            oEvent.getSource().getParent().close();
        },

        onExportExcel: function () {
            const oTable = this.byId("table");
            this.exportTableToExcel(oTable, "ucdetails", {});
        }
    });
});