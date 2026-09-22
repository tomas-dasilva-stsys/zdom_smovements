sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessagePopover",
    "sap/m/MessageItem",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/export/Spreadsheet",
    "sap/ui/export/library",
    "sap/ui/model/json/JSONModel",
    "zdomscrapmovements/model/AppJsonModel",
    "zdomscrapmovements/services/MatchcodesService",
    "zdomscrapmovements/services/TransferService"
], function (
    Controller,
	Filter,
	FilterOperator,
	MessagePopover,
	MessageItem,
	MessageBox,
	MessageToast,
	Spreadsheet,
	library,
    JSONModel,
	AppJsonModel,
	MatchcodesService,
	TransferService
) {
    "use strict";

    // ------------------------------------------------------------------
    // Singleton compartido entre TODOS los controllers que extiendan
    // BaseController (el módulo sap.ui.define se cachea, así que esta
    // instancia es única para toda la app).
    // ------------------------------------------------------------------
    const oMessageTemplate = new MessageItem({
        type: "{type}",
        title: "{title}",
        subtitle: "{subtitle}",
        description: "{description}"
    });

    const oMessagePopover = new MessagePopover({
        title: "Notifications",
        items: {
            path: "/",
            template: oMessageTemplate
        }
    });

    return Controller.extend("zdomscrapmovements.controller.BaseController", {

        onInit: function () {
            AppJsonModel.initializeModel();
            // Estado por-instancia (antes eran variables de módulo:
            // inputId / currRowPosition / stockTransfer en MainView).
            // Cada vista/controller tiene su propia copia.
            this._inputId = null;
            this._currRowPosition = null;
            this._stockTransfer = false;

            this.oFragments = this.oFragments || {};
            this._mDialogs = this._mDialogs || {};

            const popModel = new sap.ui.model.json.JSONModel({});
            oMessagePopover.setModel(popModel);

            let pop_msgModel = new sap.ui.model.json.JSONModel({
                messageLength: "",
                type: "Default"
            });
            this.getView().setModel(pop_msgModel, "popoverModel");
        },

        // ==================================================================
        // FRAGMENTS
        // ==================================================================

        getFragment: function (sFragmentName) {
            if (!this.oFragments[sFragmentName]) {
                this.oFragments[sFragmentName] = sap.ui.xmlfragment(
                    this.getView().getId(),
                    "zdomscrapmovements.view.fragments." + sFragmentName,
                    this
                );
                this.getView().addDependent(this.oFragments[sFragmentName]);
            }
            return Promise.resolve(this.oFragments[sFragmentName]);
        },

        destroyFragments: function () {
            if (this.oFragments) {
                Object.keys(this.oFragments).forEach(function (sKey) {
                    this.oFragments[sKey].destroy();
                    delete this.oFragments[sKey];
                }, this);
            }
        },

        onExitDialog: function () {
            const AppJsonModel = sap.ui.require("zdomscrapmovements/model/AppJsonModel");
            if (AppJsonModel) {
                const referenceNumbers = AppJsonModel.getProperty("/ReferenceNumbers");
                if (referenceNumbers && referenceNumbers.length > 0) {
                    AppJsonModel.setProperty("/ReferenceNumbers", []);
                    AppJsonModel.setInnerProperty("/Visible", "ReferenceNumberVisible", false);
                }
            }

            this.getFragment(`${this._inputId}HelpDialog`).then(function (oFragment) {
                oFragment.exit();
            });

            this.destroyFragments();
        },

        onExitMassFillDialog: function () {
            this.getFragment(`MassFill${this._inputId}HelpDialog`).then(function (oFragment) {
                oFragment.close();
            });
        },

        // ==================================================================
        // MATCHCODES / VALUE HELP - lógica compartida
        // ==================================================================

        getMatchCodePath: function (oValue) {
            const paths = {
                "ProductOrderOperation": { path: "/MatchCodeOperationScrapMov" },
                "Material": { path: "/MatchCodeMaterialScrapMov" },
                "StorageLocation": { path: "/MatchCodeLocationScrapMov" },
                "Reason": { path: "/MatchCodeReason" },
                "CostCenter": { path: "/MatchCodePlant" },
                "WorkCenter": { path: "/MatchCodeWorkCenterScrapMov" },
                "Plant": { path: "/MatchCodePlantScrapMov" },
                "ProductionOrder": { path: "/MatchCodeProdOrderScrapMov" },
                "SerialNumber": { path: "/MatchCodeSerialNumberScrapMov" },
                "Zuser": { path: "/MatchCodeUserScrapMov" },
                "ReferenceNumber": { path: "/MatchCodeReferenceNumber" },
                "Equipment": { path: "/MatchCodeEquipment2" },
                "HandlingUnit": { path: "/MatchCodeHu" },
                "Batch": { path: "/MatchCodeBatch" }
            };

            if (!oValue) {
                return { path: "/", title: "", description: "" };
            }

            return paths[oValue];
        },

        checkReasonExists: async function (sValue) {
            const matchCodePath = "/MatchCodeReason";
            const oFilter = new Filter("Reason", FilterOperator.EQ, sValue);

            try {
                const oData = await MatchcodesService.callGetService(matchCodePath, [oFilter]);
                return oData.results.length > 0;
            } catch (error) {
                return false;
            }
        },

        checkCostCenterPath: async function (oInput) {
            const currWorkcenter = oInput.getBindingContext().getObject().WorkCenter;
            const currentPlant = oInput.getBindingContext().getObject().Plant;
            const currInputValue = oInput.getValue();
            const aFilter = [
                new Filter("workcenter", FilterOperator.EQ, currWorkcenter),
                new Filter("plant", FilterOperator.EQ, currentPlant)
            ];

            return MatchcodesService.callGetService("/MatchCodePlant", aFilter).then(data => {
                if (data.results.length > 0) {
                    return { path: "/MatchCodePlant", filters: aFilter };
                }
                if (!currInputValue.trim()) {
                    return { path: "/MatchCodeCostCenter", filters: [] };
                }
                return { path: "/MatchCodeCostCenter", filters: [new Filter("CostCenter", FilterOperator.EQ, currInputValue)] };
            });
        },

        checkValueExists: async function (sInputId, oInput) {
            const sValue = oInput.getValue();

            try {
                const sPath = await this.checkCostCenterPath(oInput);

                const findInPaginatedResults = async (path, filters) => {
                    let currentPath = path;
                    let currentFilters = filters;

                    while (currentPath) {
                        const oData = await MatchcodesService.callGetService(currentPath, currentFilters);
                        const next = oData.__next;

                        if (oData.results && oData.results.length > 0) {
                            const validResult = oData.results.find(result => {
                                const costCenter = result.CostCenter || result.costcenter;
                                return costCenter && costCenter.trim() === sValue.trim();
                            });

                            if (validResult) {
                                return {
                                    isValid: true,
                                    expectedValue: validResult.CostCenter || validResult.costcenter
                                };
                            }
                        }

                        currentPath = next ? oData.__next : null;
                        currentFilters = next ? null : currentFilters;
                    }

                    return { isValid: false, expectedValue: null };
                };

                return await findInPaginatedResults(sPath.path, sPath.filters);
            } catch (error) {
                console.error("Error en checkValueExists:", error);
                return { isValid: false, expectedValue: null };
            }
        },

        checkValueExistsForMassFill: async function (sInputId, sCostCenter, oInput) {
            const oResourceBundle = this.getView().getModel("i18n").getResourceBundle();
            try {
                const oData = await MatchcodesService.callGetService("/MatchCodePlant", [new Filter("costcenter", FilterOperator.EQ, sCostCenter)]);

                if (oData.results.length === 0) {
                    const response = await MatchcodesService.callGetService("/MatchCodeCostCenter", [new Filter("CostCenter", FilterOperator.EQ, sCostCenter)]);

                    if (response.results.length === 0) {
                        oInput.setValueState("Error");
                        oInput.setValueStateText(oResourceBundle.getText("invalidValueMsg", [sCostCenter]));
                        return false;
                    }
                    oInput.setValueState("None");
                    oInput.setValueStateText("");
                    return true;
                }

                if (oData.results.length === 1) {
                    const expectedValue = oData.results[0].costcenter;
                    const isValid = expectedValue && expectedValue.trim() === sCostCenter.trim();
                    oInput.setValueState(isValid ? "None" : "Error");
                    oInput.setValueStateText(isValid ? "" : oResourceBundle.getText("invalidValueMsg", [sCostCenter]));
                    return isValid;
                }

                const validResult = oData.results.find(result =>
                    (result?.CostCenter || result?.costcenter) &&
                    (result.CostCenter === sCostCenter.trim() || result.costcenter === sCostCenter.trim())
                );

                oInput.setValueState(validResult ? "None" : "Error");
                oInput.setValueStateText(validResult ? "" : oResourceBundle.getText("invalidValueMsg", [sCostCenter]));
                return !!validResult;
            } catch (error) {
                return false;
            }
        },

        getCurrentFilter: function (filterKey) {
            let aFilters = [];

            const prodOrder = this.byId("ProductionOrder")?.getValue();
            const material = this.byId("Material")?.getValue();
            const plant = this.byId("Plant")?.getValue();
            const workCenter = this.byId("WorkCenter")?.getValue();

            switch (filterKey) {
                case "ProductionOrder":
                    if (material) aFilters.push(new Filter("Material", FilterOperator.EQ, material));
                    return aFilters;

                case "SerialNumber":
                    if (prodOrder) aFilters.push(new Filter("ProductionOrder", FilterOperator.EQ, prodOrder));
                    return aFilters;

                case "ProductOrderOperation":
                    if (plant) aFilters.push(new Filter("Plant", FilterOperator.EQ, plant));
                    if (workCenter) aFilters.push(new Filter("WorkCenter", FilterOperator.EQ, workCenter));
                    return aFilters;

                default:
                    return aFilters;
            }
        },

        // Value help genérico para Reason / CostCenter dentro de la tabla
        // (usa this._inputId / this._currRowPosition en vez de variables
        // de módulo, para que cada vista tenga su propio estado)
        onValueHelpRequestInputsTable: async function (oEvent) {
            const that = this;
            const oInput = oEvent.getSource();
            const currId = oInput.getId().split("-").filter(item => item === "Reason" || item === "CostCenter")[0];
            this._inputId = currId || "";

            const oTable = this.byId("table");
            const oRow = oInput.getParent();
            this._currRowPosition = oTable.getItems().indexOf(oRow);

            if (this._currRowPosition === -1) {
                console.warn("No se pudo determinar la fila para el Value Help.");
                return;
            }

            if (this._inputId === "CostCenter") {
                const sPath = await this.checkCostCenterPath(oInput);
                const singleCostCenter = await MatchcodesService.callGetService(sPath.path, sPath.filters).then(data => {
                    return data.results.length === 1 ? data.results[0].costcenter : false;
                });

                if (singleCostCenter) {
                    oInput.setValue(singleCostCenter);
                    oInput.setValueState("None");
                    oInput.setValueStateText("");
                    return;
                }

                const sFragmentName = sPath.path === "/MatchCodePlant" ? "CostCenterHelpDialog" : "CostCenterOldHelpDialog";
                const sModelProp = sPath.path === "/MatchCodePlant" ? "CostCenter" : "CostCenterOld";

                this.getFragment(sFragmentName).then(oFragment => {
                    oFragment.getTableAsync().then(function (oTable) {
                        oTable.setModel(MatchcodesService.getOdataModel());
                        const tableCols = sap.ui.require("zdomscrapmovements/model/AppJsonModel").getProperty(`/${sModelProp}`);
                        oTable.setModel(new sap.ui.model.json.JSONModel({ cols: tableCols }), "columns");

                        if (oTable.bindRows) {
                            oTable.bindAggregation("rows", { path: sPath.path, filters: sPath.filters, showHeader: false });
                        }
                        oFragment.update();
                    });
                    oFragment.open();
                });
                return;
            }

            if (this._inputId === "Reason") {
                const currSpath = this.getMatchCodePath(this._inputId);
                const oFilters = this.getCurrentFilter(this._inputId);

                this.getFragment(`${this._inputId}HelpDialog`).then(oFragment => {
                    oFragment.getTableAsync().then(function (oTable) {
                        oTable.setModel(MatchcodesService.getOdataModel());
                        let tableCols = AppJsonModel.getProperty(`/${that._inputId}`);
                        let currentJsonModel = new JSONModel({ "cols": tableCols });

                        oTable.setModel(currentJsonModel, "columns");

                        if (oTable.bindRows) {
                            oTable.bindAggregation("rows", { path: currSpath.path, filters: oFilters, showHeader: false });
                        }
                        oFragment.update();
                    });
                    oFragment.open();
                });
            }
        },

        onValueHelpOkPress: function (oEvent) {
            const oTable = this.byId("table");
            let currValue;

            if (this._inputId === "CostCenter") {
                const rowSelected = oTable.getItems()[this._currRowPosition];
                const oCtx = rowSelected.getBindingContext();
                const oModel = oCtx.getModel();
                const sRowPath = oCtx.getPath();

                const oTokenData = oEvent.getParameter("tokens")[0].getCustomData()[0].getValue();
                currValue = oTokenData.costcenter || oTokenData.CostCenter;

                oModel.setProperty(`${sRowPath}/${this._inputId}`, currValue);

                const oInput = rowSelected.getCells().find(c => c.getId().includes(this._inputId));
                if (oInput) oInput.setValueState("None");

                this.onExitDialog();
                return;
            }

            const rowSelected = oTable.getItems()[this._currRowPosition];
            const tokensSelected = oEvent.getParameter("tokens").map(token => ({ key: token.getKey(), text: token.getText() }));
            if (tokensSelected.length) currValue = tokensSelected[0].key;

            const oCtx = rowSelected.getBindingContext();
            if (!oCtx) {
                this.onExitDialog();
                return;
            }

            const oModel = oCtx.getModel();
            const sRowPath = oCtx.getPath();
            oModel.setProperty(`${sRowPath}/${this._inputId}`, currValue);

            const oInput = rowSelected.getCells().find(c => c.getId().includes(this._inputId));
            if (oInput) oInput.setValueState("None");

            this.onExitDialog();
        },

        // ==================================================================
        // INPUTS DE LA TABLA (Scrap/Free/Reason/CostCenter)
        // ==================================================================

        onInputChange: async function (oEvent) {
            const oInput = oEvent.getSource();
            const oCtx = oInput.getBindingContext();
            const oResourceBundle = this.getView().getModel("i18n").getResourceBundle();

            if (!oCtx) return;

            const sPath = oCtx.getPath();
            const oModel = oCtx.getModel();

            const sProp =
                oInput.getId().includes("CostCenter") ? "CostCenter" :
                    oInput.getId().includes("Reason") ? "Reason" :
                        null;

            if (!sProp || !oInput.getValue().trim()) {
                oInput.setValueState("None");
                oInput.setValueStateText("");
                return;
            }

            if (sProp === "Reason") {
                const valueExists = await this.checkReasonExists(oInput.getValue());
                if (!valueExists) {
                    oInput.setValueState("Error");
                    oInput.setValueStateText(oResourceBundle.getText("invalidValueMsg", [oInput.getValue()]));
                    return;
                }
            }

            if (sProp === "CostCenter") {
                const valueExists = await this.checkValueExists(sProp, oInput);
                if (!valueExists.isValid) {
                    oInput.setValueState("Error");
                    oInput.setValueStateText(oResourceBundle.getText("invalidValueMsg", [oInput.getValue()]));
                    return;
                }
            }

            oInput.setValueState("None");
            oInput.setValueStateText("");
            oModel.setProperty(sPath + "/" + sProp, oInput.getValue());
        },

        onFormatValue: function (oEvent) {
            const oInput = oEvent.getSource();
            const oCtx = oInput.getBindingContext();
            if (!oCtx) return;

            const sPath = oCtx.getPath();
            const oModel = oCtx.getModel();
            const sProp =
                oInput.getId().includes("scrapQty") ? "ScrapQuantity" :
                    oInput.getId().includes("freeQty") ? "FreeQuantity" :
                        null;

            if (!sProp) return;

            const currValue = oInput.getValue();

            if (currValue.trim() === "") {
                oInput.setValue(parseInt(0, 10).toFixed(3));
                return;
            }

            const parseValue = parseFloat(currValue);
            oModel.setProperty(sPath + "/" + sProp, parseValue.toFixed(3));
        },

        onCostCenterChange: function (oEvent) {
            const oInput = oEvent.getSource();
            const oCtx = oInput.getBindingContext();
            if (!oCtx) return;

            const sPath = oCtx.getPath();
            const oModel = oCtx.getModel();

            const sProp =
                oInput.getId().includes("scrapQty") ? "ScrapQuantity" :
                    oInput.getId().includes("freeQty") ? "FreeQuantity" :
                        oInput.getId().includes("CostCenter") ? "CostCenter" :
                            oInput.getId().includes("Reason") ? "Reason" :
                                null;

            if (!sProp) return;
            oModel.setProperty(sPath + "/" + sProp, oInput.getValue());
        },

        // ==================================================================
        // SELECTION CHANGE (genérico: usa ?. para botones que no existen
        // en todas las vistas)
        // ==================================================================

        onSelectionChange: function (oEvent) {
            const selectedItems = oEvent.getSource().getSelectedItems();
            const bHasSelection = selectedItems.length > 0;

            const deleteBtn = this.byId("discardLines");
            if (deleteBtn && deleteBtn.getVisible()) {
                deleteBtn.setEnabled(bHasSelection);
            }

            this.byId("stockTransferBtn")?.setEnabled(bHasSelection);
            this.byId("MassFillFields")?.setEnabled(bHasSelection);
            this.byId("scrapToFreeBtn")?.setEnabled(bHasSelection);
            this.byId("ucDetailBtn")?.setEnabled(bHasSelection);
        },

        onScrapToFreeButtonPress: function () {
            const scrapToFreeBtn = this.byId("scrapToFreeBtn");
            const oTable = this.byId("table");
            const selectedItems = oTable.getSelectedItems();

            selectedItems.forEach(row => {
                const cells = row.getCells();
                const blockedValue = cells.find(cell => cell.getId().includes("blockedQty"))?.getText();

                cells.find(cell => cell.getId().includes("freeQty"))?.setValue(blockedValue);
                cells.find(cell => cell.getId().includes("scrapQty"))?.setValue(parseInt("0", 10).toFixed(3));
            });

            if (scrapToFreeBtn) scrapToFreeBtn.setEnabled(false);
        },

        // ==================================================================
        // NOTIFICACIONES / MESSAGE POPOVER (singleton compartido)
        // ==================================================================

        setMessageType: function (oMessage) {
            const oResourceBundle = this.getView().getModel("i18n").getResourceBundle();
            const map = {
                S: { T: "Success", subtitle: oResourceBundle.getText("successMsg") },
                E: { T: "Error", subtitle: oResourceBundle.getText("errorMsg") },
                W: { T: "Warning", subtitle: oResourceBundle.getText("warningMsg") },
                I: { T: "Information", subtitle: oResourceBundle.getText("infoMsg") },
                A: { T: "Abort", subtitle: oResourceBundle.getText("abortMsg") }
            };
            return map[oMessage];
        },

        clearNotificationsPanel: function () {
            oMessagePopover.getModel().setData("");
            oMessagePopover.getModel().refresh(true);
            this.getView().getModel("popoverModel").getData().messageLength = "";
            this.getView().getModel("popoverModel").getData().type = "Default";
            this.byId("messagePopoverBtn")?.setEnabled(false);
            this.getView().getModel("popoverModel").refresh(true);
        },

        handleMessagePopoverPress: function (oEvent) {
            oMessagePopover.toggle(oEvent.getSource());
        },

        _pushMessages: function (aResults, sTitle) {
            const w_data = aResults.map(msg => {
                const msgType = this.setMessageType(msg.Type);
                return {
                    type: msgType.T,
                    title: sTitle,
                    subtitle: msgType.subtitle,
                    description: msg.Message
                };
            });

            const prevMsgs = Array.from(oMessagePopover.getModel().getData());
            const upDatedMsgs = [...prevMsgs, ...w_data];
            oMessagePopover.getModel().setData(upDatedMsgs);
            oMessagePopover.getModel().refresh(true);

            this.getView().getModel("popoverModel").getData().messageLength = upDatedMsgs.length;
            this.getView().getModel("popoverModel").getData().type = "Emphasized";
            this.getView().getModel("popoverModel").refresh(true);

            this.byId("messagePopoverBtn")?.setEnabled(true);
        },

        // ==================================================================
        // VALIDACIÓN Y POSTEO DE MOVIMIENTOS (usado por checkTransferMovement
        // / print labels en cualquier vista que tenga id="table")
        // ==================================================================

        checkTransferMovement: function () {
            this.clearNotificationsPanel();
            const oResourceBundle = this.getView().getModel("i18n").getResourceBundle();
            const blockedErrMsg = oResourceBundle.getText("blockedErrMsg");
            const emptyValesErrMsg = oResourceBundle.getText("emptyValuesMsg");
            const oTable = this.byId("table");
            const oItems = oTable.getSelectedItems();

            const errors = { blocked: 0, emptyFields: 0, emptyValues: 0 };
            const postScrapData = { PostSet: [], ReturnSet: [] };
            const postFreeData = { PostSet: [], ReturnSet: [] };

            oItems.forEach(item => {
                const oContext = item.getBindingContext();
                const blockedVal = parseFloat(oContext.getProperty("BlockedQuantity"));
                const scrapVal = parseFloat(item.getCells().find(cell => cell.sId.includes("scrapQty")).getValue());
                const freeVal = parseFloat(item.getCells().find(cell => cell.sId.includes("freeQty")).getValue());
                const reasonVal = item.getCells().find(cell => cell.sId.includes("Reason")).getValue();
                const costCenterVal = item.getCells().find(cell => cell.sId.includes("CostCenter")).getValue();
                const amountToTransfer = scrapVal + freeVal;

                const data = {
                    Aufnr: oContext.getProperty("ProductionOrder"),
                    Sortf: oContext.getProperty("ProductionOperation"),
                    Charg: oContext.getProperty("Charg"),
                    Idnrk: oContext.getProperty("Component"),
                    Material: oContext.getProperty("Material"),
                    ItemNumber: oContext.getProperty("ItemNumber"),
                    Lgort: oContext.getProperty("StorageLocation"),
                    Menge: oContext.getProperty("Quantity"),
                    Qmart: oContext.getProperty("NotificationType"),
                    Qmnum: oContext.getProperty("NotificationNumber"),
                    Rsnum: oContext.getProperty("ReserveNumber"),
                    Stlnr: oContext.getProperty("BomNumber"),
                    Sernr: oContext.getProperty("SerialNumber"),
                    UnitOfMeasure: oContext.getProperty("UnitOfMeasure"),
                    Werks: oContext.getProperty("Plant"),
                    WorkCtr: oContext.getProperty("WorkCenter"),
                    Zblocked: oContext.getProperty("BlockedQuantity"),
                    Zfree: freeVal.toFixed(3),
                    Zscrap: scrapVal.toFixed(3),
                    Zuser: oContext.getProperty("Zuser"),
                    Huident: oContext.getProperty("HandlingUnit"),
                    ChargEWM: oContext.getProperty("Batch"),
                    Reason: reasonVal,
                    CostCenter: costCenterVal
                };

                if (amountToTransfer > blockedVal || scrapVal > blockedVal || freeVal > blockedVal) {
                    errors.blocked++;
                    return;
                }

                if (scrapVal > 0 && (!reasonVal || !costCenterVal)) {
                    item.getCells().find(cell => cell.sId.includes("Reason")).setValueState("Error");
                    item.getCells().find(cell => cell.sId.includes("CostCenter")).setValueState("Error");
                    errors.emptyFields++;
                }

                if (scrapVal === 0 && freeVal === 0) {
                    errors.emptyValues++;
                    return;
                }

                if (reasonVal) item.getCells().find(cell => cell.sId.includes("Reason")).setValueState("None");
                if (costCenterVal) item.getCells().find(cell => cell.sId.includes("CostCenter")).setValueState("None");

                if (scrapVal > 0 && freeVal > 0) {
                    postScrapData.PostSet.push(data);
                    postFreeData.PostSet.push(data);
                } else if (scrapVal > 0) {
                    postScrapData.PostSet.push(data);
                } else if (freeVal > 0) {
                    postFreeData.PostSet.push(data);
                }
            });

            if (errors.blocked > 0) {
                MessageBox.error(blockedErrMsg);
                return false;
            }
            if (errors.emptyValues > 0) {
                MessageBox.error(emptyValesErrMsg);
                return false;
            }
            if (errors.emptyFields > 0) return false;

            return { postScrapData, postFreeData };
        },

        postScrapMovement: async function (postScrapData, postFreeData) {
            const that = this;
            const oResourceBundle = this.getView().getModel("i18n").getResourceBundle();
            const busyDialogTitle = oResourceBundle.getText("busyDialogTitle");
            const freeMovementTitle = oResourceBundle.getText("freeMovements");
            const scrapMovementTitle = oResourceBundle.getText("scrapMovements");
            const busyDialog4 = sap.ui.getCore().byId("busy4") || new sap.m.BusyDialog("busy4", { title: busyDialogTitle });

            busyDialog4.open();

            return new Promise((resolve, reject) => {
                const tasks = [];

                if (postScrapData.PostSet.length > 0) {
                    const scrapTask = TransferService.callPostService("/ZfmPostScrapSet", postScrapData).then(data => {
                        that._pushMessages(data.ReturnSet.results, scrapMovementTitle);
                        that._stockTransfer = true;
                        that.refreshAfterPost();
                    }).catch(oError => console.log(oError));

                    tasks.push(scrapTask);
                }

                if (postFreeData.PostSet.length > 0) {
                    const freeTask = TransferService.callPostService("/ZfmPostFreeSet", postFreeData).then(data => {
                        that._pushMessages(data.ReturnSet.results, freeMovementTitle);
                        that._stockTransfer = true;
                        that.refreshAfterPost();
                        postFreeData.PostSet[0].Huident = data.PostSet.results[0].Huident;
                    }).catch(oError => {
                        MessageBox.error(oError?.response?.statusText || oResourceBundle.getText("errorMsg"));
                    });

                    tasks.push(freeTask);
                }

                Promise.all(tasks)
                    .then(() => resolve())
                    .catch(err => reject(err))
                    .finally(() => busyDialog4.close());
            });
        },

        // Hook: cada vista define cómo refrescar sus datos después de
        // postear un movimiento. MainView lo pisa con smartTable.rebindTable(),
        // UcDetail con lo que corresponda (recargar el JSONModel, volver
        // atrás, etc). Acá queda un no-op por defecto.
        refreshAfterPost: function () {
            // override en cada controller si hace falta
        },

        // ==================================================================
        // IMPRESIÓN DE ETIQUETAS
        // ==================================================================

        openPrintLabels: async function () {
            const transferData = this.checkTransferMovement();
            if (!transferData) return;

            this._lastTransferData = transferData;

            const userInfo = await this.getUserInfo?.();

            if (!this._oPrintLabelsDialog) {
                this._oPrintLabelsDialog = await this.getFragment("PrintLabelsDialog");
            }
            this._oPrintLabelsDialog.open();

            const checkBoxBlocked = this.byId("cbBlockLabel");
            const checkBoxScrap = this.byId("cbScrapLabel");
            const checkBoxFree = this.byId("cbFreeLabel");

            if (userInfo) {
                TransferService.callGetService(`/PrintParametersSet('${userInfo}')`, []).then(oData => {
                    const { Block, Scrap, Free } = oData;
                    checkBoxBlocked.setSelected(Block);
                    checkBoxScrap.setSelected(Scrap);
                    checkBoxFree.setSelected(Free);
                });
            }
        },

        onPrintLabelsCancel: function () {
            this._oPrintLabelsDialog.close();
        },

        onSaveDefault: async function () {
            const printLabelDialog = this.byId("printLabelsDialog");
            printLabelDialog.setBusy(true);

            const oResourceBundle = this.getView().getModel("i18n").getResourceBundle();
            const checkBoxBlocked = this.byId("cbBlockLabel");
            const checkBoxScrap = this.byId("cbScrapLabel");
            const checkBoxFree = this.byId("cbFreeLabel");
            const userInfo = await this.getUserInfo?.();
            const oModel = TransferService.getOdataModel();

            const updateChecks = {
                Bname: userInfo,
                Block: checkBoxBlocked.getSelected(),
                Scrap: checkBoxScrap.getSelected(),
                Free: checkBoxFree.getSelected()
            };

            oModel.update(`/PrintParametersSet('${userInfo}')`, updateChecks, {
                success: () => {
                    MessageToast.show(oResourceBundle.getText("defaultSavedMsg"));
                    printLabelDialog.setBusy(false);
                },
                error: () => {
                    MessageToast.show(oResourceBundle.getText("defaultSaveErrMsg"));
                    printLabelDialog.setBusy(false);
                }
            });
        },

        onPrintLabelsConfirm: async function () {
            const printLabelsDialog = this.byId("printLabelsDialog");
            printLabelsDialog.setBusy(true);

            const oResourceBundle = this.getView().getModel("i18n").getResourceBundle();
            const transferData = this._lastTransferData || this.checkTransferMovement();
            const checkBoxBlocked = this.byId("cbBlockLabel");
            const checkBoxScrap = this.byId("cbScrapLabel");
            const checkBoxFree = this.byId("cbFreeLabel");

            if (!transferData) {
                printLabelsDialog.setBusy(false);
                return;
            }

            await this.postScrapMovement(transferData.postScrapData, transferData.postFreeData);

            const sUrl = `/sap/opu/odata/sap/ZDOM_SIPMECA_SRV_01/ZfmSaveDefectPrintCollection('0001')/$value`;
            const printPromises = [];
            const printData = transferData.postFreeData.PostSet.length > 0
                ? transferData.postFreeData.PostSet[0]
                : transferData.postScrapData.PostSet[0];

            const buildRequest = (slugData) => fetch(sUrl, {
                headers: { Slug: JSON.stringify(slugData), Accept: "application/pdf" }
            }).catch(oError => {
                console.log(oError);
                return null;
            });

            if (checkBoxFree.getSelected()) {
                printPromises.push(buildRequest({
                    IvWerks: printData.Werks,
                    IvWorkCtr: printData.WorkCtr,
                    handlingunit: printData.Huident,
                    qmnum: printData.Qmnum,
                    print: "3"
                }));
            }

            if (checkBoxScrap.getSelected()) {
                printPromises.push(buildRequest({ qmnum: printData.Qmnum, print: "2" }));
            }

            if (checkBoxBlocked.getSelected()) {
                printPromises.push(buildRequest({ qmnum: printData.Qmnum, print: "1" }));
            }

            if (printPromises.length > 0) {
                const responses = await Promise.all(printPromises);
                const allOk = responses.every(response => response && response.ok);

                MessageToast.show(allOk
                    ? oResourceBundle.getText("printedSuccessfully")
                    : oResourceBundle.getText("printError"));
            }

            this._lastTransferData = null;
            printLabelsDialog.setBusy(false);
            printLabelsDialog.close();
        },

        // ==================================================================
        // EXPORT A EXCEL (genérico: recibe la tabla real -
        // sap.ui.table.Table de la SmartTable en MainView, o
        // sap.m.Table en UcDetail - y el nombre de archivo)
        // ==================================================================

        exportTableToExcel: async function (oInnerTable, sFileName, mMassChanges) {
            try {
                const oModel = oInnerTable.getModel();
                const oBinding = oInnerTable.getBinding("rows") || oInnerTable.getBinding("items");

                if (!oBinding) {
                    MessageToast.show("No hay datos disponibles para exportar.");
                    return;
                }

                sap.ui.core.BusyIndicator.show(0);

                await this._loadAllContexts(oBinding);

                const iLength = oBinding.getLength();
                const aContexts = oBinding.getContexts(0, iLength).filter(Boolean);
                const aExportDataRaw = aContexts.map(ctx => ctx.getObject());

                const sEntityPath = oBinding.getPath();
                const aExportData = aExportDataRaw.map(oObj => {
                    let oOverrides = {};

                    if (mMassChanges && oModel.createKey) {
                        const sKeyPath = oModel.createKey(sEntityPath, { ...oObj });
                        oOverrides = mMassChanges[sKeyPath] || {};
                    }

                    const oMerged = { ...oObj, ...oOverrides };

                    return {
                        ...oMerged,
                        NotificationCreationDate: this._parseToDate(oMerged.NotificationCreationDate),
                        NotificationCreationTime: this._parseTime(oMerged.NotificationCreationTime),
                        Time: this._parseTime(oMerged.Time)
                    };
                });

                const aColumns = this.getColumnsFromTable(oInnerTable);

                const oSheet = new Spreadsheet({
                    workbook: { columns: aColumns },
                    dataSource: aExportData,
                    fileName: sFileName || "Export.xlsx"
                });

                await oSheet.build();
                oSheet.destroy();
            } catch (error) {
                console.error("Error en exportación:", error);
                MessageToast.show("Error en exportación: " + error.message);
            } finally {
                sap.ui.core.BusyIndicator.hide();
            }
        },

        // Arma la definición de columnas para el Spreadsheet a partir de
        // la tabla real. Funciona tanto con sap.ui.table.Table (columnas
        // con getOrder()) como con sap.m.Table (columnas sin getOrder(),
        // se usa el índice de la aggregation, que ya refleja el reorder
        // aplicado por el p13n.Engine).
        // Lee el nombre de la propiedad OData desde:
        //   - customData "p13nData" (JSON {leadingProperty|columnKey}) -> usado por SmartTable
        //   - customData "exportProperty" (string plano) -> fallback simple
        getColumnsFromTable: function (oInnerTable) {
            const bIsGridTable = oInnerTable.getMetadata().getName() === "sap.ui.table.Table";

            const aUIColumns = oInnerTable.getColumns()
                .filter(col => col.getVisible())
                .slice()
                .sort((a, b) => {
                    if (bIsGridTable && a.getOrder && b.getOrder) {
                        return a.getOrder() - b.getOrder();
                    }
                    return oInnerTable.indexOfColumn(a) - oInnerTable.indexOfColumn(b);
                });

            const aColumns = [];

            aUIColumns.forEach(col => {
                let sLabel = "";
                let sProperty = "";

                const oHeader = col.getHeader && col.getHeader();
                if (oHeader) {
                    sLabel = typeof oHeader.getText === "function" ? oHeader.getText() : (typeof oHeader === "string" ? oHeader : "");
                }

                const aCustomData = col.getCustomData ? col.getCustomData() : [];
                aCustomData.forEach(cd => {
                    const key = cd.getKey && cd.getKey();

                    if (key === "p13nData") {
                        try {
                            const v = cd.getValue();
                            const parsed = typeof v === "string" ? JSON.parse(v) : v;
                            if (parsed && (parsed.leadingProperty || parsed.columnKey)) {
                                sProperty = parsed.leadingProperty || parsed.columnKey;
                            }
                        } catch (e) {
                            console.warn("Error parseando p13nData:", e);
                        }
                    }

                    if (key === "exportProperty") {
                        sProperty = cd.getValue();
                    }
                });

                if (!sProperty) return;

                const oColDef = { label: sLabel || sProperty, property: sProperty, width: 20 };

                if (["BlockedQuantity", "ScrapQuantity", "FreeQuantity", "Quantity"].includes(sProperty)) {
                    oColDef.type = exportLibrary.EdmType.Number;
                    oColDef.scale = 3;
                    oColDef.delimiter = true;
                }

                if (["DateFrom", "DateTo", "NotificationCreationDate"].includes(sProperty)) {
                    oColDef.type = exportLibrary.EdmType.Date;
                }

                if (["Time", "NotificationCreationTime"].includes(sProperty)) {
                    oColDef.type = exportLibrary.EdmType.Time;
                }

                aColumns.push(oColDef);
            });

            return aColumns;
        },

        deduceColumnType: function (prop) {
            if (/date/i.test(prop)) return exportLibrary.EdmType.Date;
            if (/time/i.test(prop)) return exportLibrary.EdmType.String;
            if (/qty|quantity|amount|number|value/i.test(prop)) return exportLibrary.EdmType.Number;
            return exportLibrary.EdmType.String;
        },

        _loadAllContexts: function (oBinding) {
            const iTotal = oBinding.getLength();
            const iPageSize = 1000;

            return new Promise(resolve => {
                let loaded = 0;

                const fnDataReceived = () => {
                    loaded = oBinding.getContexts(0, iTotal).filter(Boolean).length;
                    if (loaded >= iTotal) {
                        oBinding.detachDataReceived(fnDataReceived);
                        resolve();
                    }
                };

                oBinding.attachDataReceived(fnDataReceived);

                for (let i = 0; i < iTotal; i += iPageSize) {
                    oBinding.getContexts(i, iPageSize);
                }

                fnDataReceived();
            });
        },

        _parseToDate: function (raw) {
            if (!raw) return null;
            if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;

            const s = String(raw).trim();
            let m = /\/Date\((\d+)(?:[+-]\d+)?\)\//.exec(s);
            if (m) return new Date(parseInt(m[1], 10));

            if (/^\d{8}$/.test(s)) {
                const y = +s.slice(0, 4);
                const mth = +s.slice(4, 6) - 1;
                const d = +s.slice(6, 8);
                return new Date(Date.UTC(y, mth, d));
            }

            const d2 = new Date(s);
            return isNaN(d2.getTime()) ? null : d2;
        },

        _parseTime: function (vMs) {
            if (!vMs) return "";
            let ms = typeof vMs === "object" ? vMs.ms : vMs;

            if (typeof ms === "string" && ms.startsWith("PT")) {
                const r = /PT(\d+)H(\d+)M(\d+)S/.exec(ms);
                if (r) return `${r[1].padStart(2, "0")}:${r[2].padStart(2, "0")}:${r[3].padStart(2, "0")}`;
            }

            if (isNaN(ms)) return vMs;

            const sec = Math.floor(ms / 1000);
            return [Math.floor(sec / 3600), Math.floor((sec % 3600) / 60), sec % 60]
                .map(v => String(v).padStart(2, "0")).join(":");
        }

    });
});