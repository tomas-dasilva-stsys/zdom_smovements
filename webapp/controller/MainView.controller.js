sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    'sap/ui/core/Fragment',
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessagePopover",
    "sap/m/MessageItem",
    "zdomscrapmovements/model/AppJsonModel",
    "zdomscrapmovements/services/TransferService",
    "zdomscrapmovements/services/MatchcodesService",
    "sap/m/MessageBox",
    "zdomscrapmovements/model/Formatter",
    "sap/ui/export/Spreadsheet",
],
    function (Controller,
        JSONModel,
        Fragment,
        Filter,
        FilterOperator,
        MessagePopover,
        MessageItem,
        AppJsonModel,
        TransferService,
        MatchcodesService,
        MessageBox,
        Formatter,
        Spreadsheet) {
        "use strict";
        let inputId;
        let currRowPosition;
        let stockTransfer = false;

        let oMessageTemplate = new MessageItem({
            type: '{type}',
            title: '{title}',
            subtitle: '{subtitle}',
            description: '{description}'
        });

        let oMessagePopover = new MessagePopover({
            title: 'Notifications',
            items: {
                path: '/',
                template: oMessageTemplate
            }
        });

        return Controller.extend("zdomscrapmovements.controller.MainView", {
            oFragments: {},
            formatter: Formatter,
            oVariants: {
                "": {
                    "ProductionOrder": "",
                    "ProductOrderOperation": "",
                    "SerialNumber": "",
                    "Material": "",
                    "WorkCenter": "",
                    "Plant": "",
                    "StorageLocation": "",
                    "Zuser": "",
                }
            },

            onInit: function () {
                AppJsonModel.initializeModel();
                let oView = this.getView();
                let oModel = this.getOwnerComponent().getModel();

                oView.setModel(oModel);
                this._mDialogs = {};
                this._exportFilters;
                this._mMassChanges = {};

                let pop_msgModel = new sap.ui.model.json.JSONModel({
                    "messageLength": '',
                    "type": 'Default'
                })

                this.getView().setModel(pop_msgModel, "popoverModel");
                let popModel = new sap.ui.model.json.JSONModel({});
                oMessagePopover.setModel(popModel);
                this._localChangesModel = new sap.ui.model.json.JSONModel({});
                this.getView().setModel(this._localChangesModel, "localChanges");
            },

            onInputChange: function (oEvent) {
                const oInput = oEvent.getSource();
                const oCtx = oInput.getBindingContext();

                if (!oCtx) return;

                const sPath = oCtx.getPath();
                const oModel = oCtx.getModel();


                // Nombre del campo desde el ID del input
                const sProp =
                    oInput.getId().includes('CostCenter') ? 'CostCenter' :
                        oInput.getId().includes('Reason') ? 'Reason' :
                            null;

                if (!sProp) return;

                oModel.setProperty(sPath + "/" + sProp, oInput.getValue());
            },

            onSmartFilterBarAfterVariantSave: function (oEvent) {
                const variantManagement = this.byId('smartFilterBar').getVariantManagement();
                const currentFilterValues = this.getCustomFilters();
                const variants = variantManagement.getAllVariants();
                const currVariantId = variantManagement.getCurrentVariantId();
                const currentVariant = variants.filter(variant => variant?.sId === currVariantId);
                const variantId = currentVariant[0].sId;

                this.oVariants = {
                    ...this.oVariants, ...{
                        [`${variantId}`]: currentFilterValues
                    }
                }

                let storedVariants = JSON.parse(localStorage.getItem('variants')) || [];
                let existingVariantIndex = storedVariants.findIndex(variant => variant.hasOwnProperty(variantId));

                if (!existingVariantIndex) {
                    storedVariants[existingVariantIndex][variantId] = currentFilterValues
                    localStorage.setItem('variants', JSON.stringify(storedVariants));
                    return;
                }

                storedVariants.push({ [`${variantId}`]: this.oVariants[variantId] });
                localStorage.setItem('variants', JSON.stringify(storedVariants));
            },

            onSmartFilterBarAfterVariantLoad: function (oEvent) {
                // const currentFilterValues = this.getCustomFilters();
                let storedVariants = JSON.parse(localStorage.getItem('variants')) || [];

                const variantManagement = this.byId('smartFilterBar').getVariantManagement();
                const variants = variantManagement.getAllVariants();
                const currVariantId = variantManagement.getCurrentVariantId();
                const currentVariant = variants.filter(variant => variant?.sId === currVariantId);

                if (currentVariant.length === 0) {
                    this.setCustomFilters(this.oVariants[""]);
                    return;
                }

                const variantId = currentVariant[0].sId;
                if (storedVariants.length > 0) {
                    let actualVariant = storedVariants.filter(variant => variant[variantId])[0];
                    this.setCustomFilters(actualVariant[variantId]);
                }
            },

            getCustomFilters: function () {
                const filterValues = AppJsonModel.getProperty('/FilterValues');
                return {
                    ProductionOrder: filterValues.ProductionOrder,
                    ProductOrderOperation: filterValues.ProductOrderOperation,
                    Plant: filterValues.Plant,
                    WorkCenter: filterValues.WorkCenter,
                    StorageLocation: filterValues.StorageLocation,
                    Material: filterValues.Material,
                    SerialNumber: filterValues.SerialNumber,
                    Zuser: filterValues.Zuser,
                };
            },

            setCustomFilters: function (inputValues) {
                AppJsonModel.setInnerProperty('/FilterValues', 'ProductionOrder', inputValues.ProductionOrder);
                AppJsonModel.setInnerProperty('/FilterValues', 'ProductOrderOperation', inputValues.ProductOrderOperation);
                AppJsonModel.setInnerProperty('/FilterValues', 'Plant', inputValues.Plant);
                AppJsonModel.setInnerProperty('/FilterValues', 'WorkCenter', inputValues.WorkCenter);
                AppJsonModel.setInnerProperty('/FilterValues', 'StorageLocation', inputValues.StorageLocation);
                AppJsonModel.setInnerProperty('/FilterValues', 'Material', inputValues.Material);
                AppJsonModel.setInnerProperty('/FilterValues', 'SerialNumber', inputValues.SerialNumber);
                AppJsonModel.setInnerProperty('/FilterValues', 'Zuser', inputValues.Zuser);
            },

            getFragment: function (sFragmentName) {
                if (!this.oFragments[sFragmentName]) {
                    this.oFragments[sFragmentName] = sap.ui.xmlfragment(this.getView().getId(), "zdomscrapmovements.view.fragments." +
                        sFragmentName, this);
                    this.getView().addDependent(this.oFragments[sFragmentName]);
                }
                return Promise.resolve(this.oFragments[sFragmentName]);
            },

            getMatchCodePath: function (oValue) {
                let paths = {
                    'ProductOrderOperation': { path: '/MatchCodeOperationScrapMov' },
                    'Material': { path: '/MatchCodeMaterialScrapMov' },
                    'StorageLocation': { path: '/MatchCodeLocationScrapMov' },
                    'Reason': { path: '/MatchCodeReason' },
                    'CostCenter': { path: '/MatchCodePlant' },
                    'WorkCenter': { path: '/MatchCodeWorkCenterScrapMov' },
                    'Plant': { path: '/MatchCodePlantScrapMov' },
                    'ProductionOrder': { path: '/MatchCodeProdOrderScrapMov' },
                    'SerialNumber': { path: '/MatchCodeSerialNumberScrapMov' },
                    'Zuser': { path: '/MatchCodeUserScrapMov' },
                    'ReferenceNumber': { path: '/MatchCodeReferenceNumber' },
                    'Equipment': { path: '/MatchCodeEquipment2' }
                }

                if (!oValue) {
                    return { path: '/', title: '', description: '' };
                }

                return paths[oValue];
            },

            getCurrentFilter: function (filterKey) {
                // inizialise filters array
                let aFilters = [];

                // getting filters values
                const prodOrder = this.byId('ProductionOrder').getValue();
                const prodOperation = this.byId('ProductOrderOperation').getValue();
                const user = this.byId('Zuser').getValue();
                const material = this.byId('Material').getValue();
                const plant = this.byId('Plant').getValue();
                const workCenter = this.byId('WorkCenter').getValue();
                const storageLocation = this.byId('StorageLocation').getValue();
                const serialNumber = this.byId('SerialNumber').getValue();

                // switching by the inputID to set filters
                switch (filterKey) {
                    case 'ProductionOrder':
                        if (material) {
                            aFilters.push(new Filter('Material', FilterOperator.EQ, material));
                        }
                        return aFilters;

                    case 'SerialNumber':
                        if (prodOrder) {
                            aFilters.push(new Filter('ProductionOrder', FilterOperator.EQ, prodOrder));
                        }
                        return aFilters;

                    case 'ProductOrderOperation':
                        if (plant) {
                            aFilters.push(new Filter('Plant', FilterOperator.EQ, plant));
                        }

                        if (workCenter) {
                            aFilters.push(new Filter('WorkCenter', FilterOperator.EQ, workCenter));
                        }
                        return aFilters;
                }
            },

            toggleEnabledInput: function () {
                let radioBtns = this.getView().byId('radioButtonsId');
                let selectedCheckBox = radioBtns.getSelectedIndex();
                let reasonMovementInput = this.getView().byId('reasonMovementInput');
                let reasonLabel = this.getView().byId('idMovementReason');

                if (selectedCheckBox === 0) {
                    reasonLabel.setVisible(false);
                    reasonMovementInput.setVisible(false);
                } else {
                    reasonLabel.setVisible(true);
                    reasonMovementInput.setVisible(true);
                }
            },

            _onDataLoaded: function () {
                console.log("Tabla inicializada y preparada.");
            },

            onLiveChange: function (oEvent) {
                let currInputId = oEvent.getSource().getId().split('-').pop();
                let currInput = this.byId(currInputId);
                currInput.setValue(oEvent.getParameter("value").toUpperCase());
            },

            onInputMassFillLiveChange: function (oEvent) {
                let currInputId = oEvent.getSource().getId().split('--').pop();
                let currInput = this.byId(currInputId);

                if (currInput.getValue().trim()) {
                    currInput.setValueState('None');
                }
            },

            onUpdateFinished: function (oEvent) {
                console.log(oEvent);
            },

            onSearch: function () {
                stockTransfer = false;
                this.clearNotificationsPanel();
            },

            onSelectionChange: function (oEvent) {
                // let oTable = oEvent.getSource();
                // let selectedIndices = oTable.getSelectedIndices(); // índices seleccionados

                // let stockMovementBtn = this.getView().byId("stockTransferBtn");
                // let massFillBtn = this.byId("MassFillFields");

                // let bHasSelection = selectedIndices.length > 0;
                // stockMovementBtn.setEnabled(bHasSelection);
                // massFillBtn.setEnabled(bHasSelection);

                let selectedItems = oEvent.getSource().getSelectedItems();
                let stockMovementBtn = this.getView().byId('stockTransferBtn');
                let massFillBtn = this.byId("MassFillFields");
                let scrapToFreeBtn = this.byId("scrapToFreeBtn");

                if (selectedItems.length > 0) {
                    stockMovementBtn.setEnabled(true);
                    massFillBtn.setEnabled(true);
                    scrapToFreeBtn.setEnabled(true);

                } else {
                    stockMovementBtn.setEnabled(false)
                    massFillBtn.setEnabled(false)
                    scrapToFreeBtn.setEnabled(false);
                }
            },

            onSelectionChangeUiTable: function (oEvent) {
                let oTable = oEvent.getSource(); // sap.ui.table.Table
                let aSelectedIndices = oTable.getSelectedIndices(); // índices seleccionados

                let stockMovementBtn = this.getView().byId("stockTransferBtn");
                let massFillBtn = this.byId("MassFillFields");
                let scrapToFreeBtn = this.byId("scrapToFreeBtn");

                let bHasSelection = aSelectedIndices.length > 0;

                stockMovementBtn.setEnabled(bHasSelection);
                massFillBtn.setEnabled(bHasSelection);
                scrapToFreeBtn.setEnabled(bHasSelection);
            },

            onScrapToFreeButtonPress: function () {
                const scrapToFreeBtn = this.byId('scrapToFreeBtn');
                const oTable = this.byId('table');
                const selectedItems = oTable.getSelectedItems();

                selectedItems.forEach(row => {
                    let cells = row.getCells();
                    let blockedValue = cells.filter(cell => cell.getId().includes('blockedQty'))[0].getText();

                    cells.filter(cell => cell.getId().includes('freeQty'))[0].setValue(blockedValue);
                    cells.filter(cell => cell.getId().includes('scrapQty'))[0].setValue(parseInt('0').toFixed(3));
                })

                scrapToFreeBtn.setEnabled(false);
            },

            onScrapToFreeButtonPressUiTable: function () {
                const scrapToFreeBtn = this.byId("scrapToFreeBtn");
                const oTable = this.byId("idUiTable");

                // obtener índices seleccionados
                const aSelectedIndices = oTable.getSelectedIndices();

                aSelectedIndices.forEach(iIndex => {
                    // obtener contexto y objeto de datos
                    let oContext = oTable.getContextByIndex(iIndex);
                    if (!oContext) return;

                    let oData = oContext.getObject();

                    // obtener la fila (control de UI)
                    let oRow = oTable.getRows()[iIndex - oTable.getFirstVisibleRow()];
                    if (!oRow) return;

                    let aCells = oRow.getCells();

                    // obtener valores y setear en las celdas
                    let oBlockedCell = aCells.find(c => c.getId().includes("blockedQty"));
                    let blockedValue = oBlockedCell?.getText ? oBlockedCell.getText() : "0";

                    let oFreeCell = aCells.find(c => c.getId().includes("freeQty"));
                    if (oFreeCell?.setValue) {
                        oFreeCell.setValue(blockedValue);
                    }

                    let oScrapCell = aCells.find(c => c.getId().includes("scrapQty"));
                    if (oScrapCell?.setValue) {
                        oScrapCell.setValue(parseInt("0").toFixed(3));
                    }
                });

                // deshabilitar botón después de usar
                scrapToFreeBtn.setEnabled(false);
            },


            onUpdateFinished: function () {
                let table = this.getView().byId('table');
                let selectedItems = table.getSelectedItems();
                let notificationPanel = this.getView().byId('messagePopoverBtn');
                let stockMovementBtn = this.getView().byId('stockTransferBtn');

                selectedItems.length > 0 ? stockMovementBtn.setEnabled(true) : stockMovementBtn.setEnabled(false);
            },

            onValueChange: function () {
                let reasonMovementInput = this.getView().byId('reasonMovementInput');

                if (reasonMovementInput.getValue()) {
                    reasonMovementInput.setValueState('None');
                }
            },

            setMessageType: function (oMessage) {
                const oResourceBundle = this.getView().getModel("i18n").getResourceBundle();
                const successMsg = oResourceBundle.getText("successMsg");
                const errorMsg = oResourceBundle.getText("errorMsg");
                const warningMsg = oResourceBundle.getText("warningMsg");
                const infoMsg = oResourceBundle.getText("infoMsg");
                const abortMsg = oResourceBundle.getText("abortMsg");

                switch (oMessage) {
                    case 'S':
                        return { T: 'Success', subtitle: successMsg }
                    case 'E':
                        return { T: 'Error', subtitle: errorMsg }
                    case 'W':
                        return { T: 'Warning', subtitle: warningMsg }
                    case 'I':
                        return { T: 'Information', subtitle: infoMsg }
                    case 'A':
                        return { T: 'Abort', subtitle: abortMsg }

                }
            },

            beforeRebind: function (oEvent) {
                // getting table control
                const oTable = this.byId('table');
                const oBinding = oTable?.getBinding("items") || oTable?.getBinding("rows");
                // getting table items
                let tableItems = oTable.getItems();
                // setting regEx
                let regEx = /--([a-zA-Z]+)--([a-zA-Z]+)/;


                // reset filters
                if (oBinding) {
                    const oModel = oBinding.getModel();

                    oModel.resetChanges();
                }

                if (this._exportFilters) {
                    this._exportFilters = [];
                }

                if (this._mMassChanges) {
                    this._mMassChanges = {}
                }

                // getting filters controls
                let mBindingParams = oEvent.getParameter("bindingParams");

                let oSmtFilter = this.getView().byId("smartFilterBar");
                let dateFrom = oSmtFilter.getControlByKey("DateFrom");
                let dateTo = oSmtFilter.getControlByKey("DateTo");
                let notificationCreationDate = oSmtFilter.getControlByKey("NotificationCreationDate");
                // let notificationCreationTime = oSmtFilter.getControlByKey("NotificationCreationTime");
                let productionOrder = oSmtFilter.getControlByKey("ProductionOrder");
                let prodOperation = oSmtFilter.getControlByKey("ProductionOperation");
                let zuser = oSmtFilter.getControlByKey("Zuser");
                let material = oSmtFilter.getControlByKey("Component");
                let plant = oSmtFilter.getControlByKey("Plant");
                let workCenter = oSmtFilter.getControlByKey("WorkCenter");
                let storageLocation = oSmtFilter.getControlByKey("StorageLocation");
                let serialNumber = oSmtFilter.getControlByKey("SerialNumber");
                let referenceNumber = oSmtFilter.getControlByKey("ReferenceNumber");
                let equipment = oSmtFilter.getControlByKey("Equipment");

                // getting filters values
                let dateFromValue = dateFrom.getValue();
                let dateToValue = dateTo.getValue();
                let notificationCreationDateValue = notificationCreationDate.getValue();
                // let notificationCreationTimeValue = notificationCreationTime.getValue();

                // getting timeFrom and timeTo values
                // let notCreationTimeFrom = this.byId("timeFrom").getValue();
                // let notCreationTimeTo = this.byId("timeTo").getValue();
                //

                let prodOrderValues = productionOrder.getTokens().map(token => token.getKey());
                let prodOperationValues = prodOperation.getTokens().map(token => token.getKey());
                let zuserValues = zuser.getTokens().map(token => token.getKey());
                let materialValues = material.getTokens().map(token => token.getKey());
                let plantValues = plant.getTokens().map(token => token.getKey());
                let workCenterValues = workCenter.getTokens().map(token => token.getKey());
                let storageLocationValues = storageLocation.getTokens().map(token => token.getKey());
                let serialNumberValues = serialNumber.getTokens().map(token => token.getKey());
                let referenceNumberValues = referenceNumber.getTokens().map(token => token.getKey());
                let equipmentValues = equipment.getTokens().map(token => token.getKey());

                if (prodOrderValues.length > 0) {
                    this.setSmartFilters(mBindingParams, prodOrderValues, "ProductionOrder");
                }

                if (prodOperationValues.length > 0) {
                    this.setSmartFilters(mBindingParams, prodOperationValues, "ProductionOperation");
                }

                if (zuserValues.length > 0) {
                    this.setSmartFilters(mBindingParams, zuserValues, "Zuser");
                }

                if (materialValues.length > 0) {
                    this.setSmartFilters(mBindingParams, materialValues, "Material");
                }

                if (plantValues.length > 0) {
                    this.setSmartFilters(mBindingParams, plantValues, "Plant");
                }

                if (workCenterValues.length > 0) {
                    this.setSmartFilters(mBindingParams, workCenterValues, "WorkCenter");
                }

                if (storageLocationValues.length > 0) {
                    this.setSmartFilters(mBindingParams, storageLocationValues, "StorageLocation");
                }

                if (serialNumberValues.length > 0) {
                    this.setSmartFilters(mBindingParams, serialNumberValues, "SerialNumber");
                }

                if (referenceNumberValues.length > 0) {
                    this.setSmartFilters(mBindingParams, referenceNumberValues, "ReferenceNumber");
                }

                if (equipmentValues.length > 0) {
                    this.setSmartFilters(mBindingParams, equipmentValues, "Equipment");
                }

                if (dateFromValue && dateToValue) {
                    let betweenFilter = new Filter("DateFrom", FilterOperator.BT, new Date(dateFromValue), new Date(dateToValue));
                    mBindingParams.filters.push(betweenFilter);
                }

                if (dateFromValue && !dateToValue) {
                    let dateFromFilter = new Filter("DateFrom", FilterOperator.EQ, new Date(dateFromValue));
                    mBindingParams.filters.push(dateFromFilter);
                }

                if (dateToValue && !dateFromValue) {
                    let dateToFilter = new Filter("DateTo", FilterOperator.EQ, new Date(dateToValue));
                    mBindingParams.filters.push(dateToFilter);
                }

                if (notificationCreationDateValue) {
                    const dateFrom = notificationCreationDate.getDateValue()
                    const dateTo = notificationCreationDate.getSecondDateValue()

                    let dateFromStr
                    let dateToStr

                    const formatDateToYYYYMMDD = (date) => {
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        return `${year}${month}${day}`; // "20250704"
                    };

                    if (dateFrom) {
                        dateFromStr = formatDateToYYYYMMDD(dateFrom);
                    }

                    if (dateTo) {
                        dateToStr = formatDateToYYYYMMDD(dateTo);
                    }


                    if (dateFrom && dateTo) {
                        let notifFilter = new Filter("NotificationCreationDate", FilterOperator.BT, dateFromStr, dateToStr);
                        mBindingParams.filters.push(notifFilter);
                    } else if (dateFrom) {
                        let notifFilter = new Filter("NotificationCreationDate", FilterOperator.EQ, dateFromStr);
                        mBindingParams.filters.push(notifFilter);
                    } else if (dateTo) {
                        let notifFilter = new Filter("NotificationCreationDate", FilterOperator.EQ, dateToStr);
                        mBindingParams.filters.push(notifFilter);
                    }
                }

                // if (notCreationTimeFrom || notCreationTimeTo) {
                //     // let [hours, minutes, seconds] = notificationCreationTimeValue.split(":");
                //     const [fromHours, fromMin, fromSec] = notCreationTimeFrom.split(':');
                //     const [toHours, toMin, toSec] = notCreationTimeTo.split(':');

                //     // convert to format OData Edm.Time: PTxxHxxMxxS
                //     // let edmTimeValue = `PT${hours}H${minutes}M${seconds}S`;

                //     const edmTimeFromValue = `PT${fromHours}H${fromMin}M${fromSec}S`;
                //     const edmTimeToValue = `PT${toHours}H${toMin}M${toSec}S`;

                //     let notificationCreationTimeFilter = new Filter("NotificationCreationTime", FilterOperator.BT, edmTimeFromValue, edmTimeToValue);

                //     mBindingParams.filters.push(notificationCreationTimeFilter);
                // }

                if (stockTransfer) {
                    tableItems.forEach(row => {
                        let rowCells = row.getCells();
                        let blockedCellValue = rowCells.filter(cell => cell.getId().includes('blockedQty'))[0].getText();

                        rowCells.filter(cell => cell.getId().includes('Reason'))[0].setValue('');
                        rowCells.filter(cell => cell.getId().includes('Reason'))[0].setValueState('None');

                        rowCells.filter(cell => cell.getId().includes('CostCenter'))[0].setValue('');
                        rowCells.filter(cell => cell.getId().includes('CostCenter'))[0].setValueState('None');

                        rowCells.filter(cell => cell.getId().includes('freeQty'))[0].setValue(parseInt('0').toFixed(3));
                        rowCells.filter(cell => cell.getId().includes('scrapQty'))[0].setValue(blockedCellValue);
                    })

                    // removing selections from table
                    oTable.removeSelections(true);
                    this.byId('MassFillFields').setEnabled(false);
                    this.byId('stockTransferBtn').setEnabled(false);
                    this.byId('scrapToFreeBtn').setEnabled(false);
                    return;
                }

                oTable.removeSelections(true);
            },

            beforeRebindUiTable: function (oEvent) {
                const oTable = this.byId("idUiTable"); // sap.ui.table.Table
                let mBindingParams = oEvent.getParameter("bindingParams");
                let oSmtFilter = this.getView().byId("smartFilterBar");

                // getting filters controls
                let dateFrom = oSmtFilter.getControlByKey("DateFrom");
                let dateTo = oSmtFilter.getControlByKey("DateTo");
                let productionOrder = oSmtFilter.getControlByKey("ProductionOrder");
                let prodOperation = oSmtFilter.getControlByKey("ProductionOperation");
                let zuser = oSmtFilter.getControlByKey("Zuser");
                let material = oSmtFilter.getControlByKey("Component");
                let plant = oSmtFilter.getControlByKey("Plant");
                let workCenter = oSmtFilter.getControlByKey("WorkCenter");
                let storageLocation = oSmtFilter.getControlByKey("StorageLocation");
                let serialNumber = oSmtFilter.getControlByKey("SerialNumber");
                let referenceNumber = oSmtFilter.getControlByKey("ReferenceNumber");
                let equipment = oSmtFilter.getControlByKey("Equipment");

                // getting filters values
                let dateFromValue = dateFrom.getValue();
                let dateToValue = dateTo.getValue();
                let prodOrderValues = productionOrder.getTokens().map(token => token.getKey());
                let prodOperationValues = prodOperation.getTokens().map(token => token.getKey());
                let zuserValues = zuser.getTokens().map(token => token.getKey());
                let materialValues = material.getTokens().map(token => token.getKey());
                let plantValues = plant.getTokens().map(token => token.getKey());
                let workCenterValues = workCenter.getTokens().map(token => token.getKey());
                let storageLocationValues = storageLocation.getTokens().map(token => token.getKey());
                let serialNumberValues = serialNumber.getTokens().map(token => token.getKey());
                let referenceNumberValues = referenceNumber.getTokens().map(token => token.getKey());
                let equipmentValues = equipment.getTokens().map(token => token.getKey());

                if (prodOrderValues.length > 0) {
                    this.setSmartFilters(mBindingParams, prodOrderValues, "ProductionOrder");
                }

                if (prodOperationValues.length > 0) {
                    this.setSmartFilters(mBindingParams, prodOperationValues, "ProductionOperation");
                }

                if (zuserValues.length > 0) {
                    this.setSmartFilters(mBindingParams, zuserValues, "Zuser");
                }

                if (materialValues.length > 0) {
                    this.setSmartFilters(mBindingParams, materialValues, "Material");
                }

                if (plantValues.length > 0) {
                    this.setSmartFilters(mBindingParams, plantValues, "Plant");
                }

                if (workCenterValues.length > 0) {
                    this.setSmartFilters(mBindingParams, workCenterValues, "WorkCenter");
                }

                if (storageLocationValues.length > 0) {
                    this.setSmartFilters(mBindingParams, storageLocationValues, "StorageLocation");
                }

                if (serialNumberValues.length > 0) {
                    this.setSmartFilters(mBindingParams, serialNumberValues, "SerialNumber");
                }

                if (referenceNumberValues.length > 0) {
                    this.setSmartFilters(mBindingParams, referenceNumberValues, "ReferenceNumber");
                }

                if (equipmentValues.length > 0) {
                    this.setSmartFilters(mBindingParams, equipmentValues, "Equipment");
                }

                if (dateFromValue && dateToValue) {
                    let betweenFilter = new Filter("DateFrom", FilterOperator.BT, new Date(dateFromValue), new Date(dateToValue));
                    mBindingParams.filters.push(betweenFilter);
                }

                if (dateFromValue && !dateToValue) {
                    let dateFromFilter = new Filter("DateFrom", FilterOperator.EQ, new Date(dateFromValue));
                    mBindingParams.filters.push(dateFromFilter);
                }

                if (dateToValue && !dateFromValue) {
                    let dateToFilter = new Filter("DateTo", FilterOperator.EQ, new Date(dateToValue));
                    mBindingParams.filters.push(dateToFilter);
                }

                if (stockTransfer) {
                    // obtenés todos los rows actualmente renderizados
                    let aRows = oTable.getRows();

                    aRows.forEach(oRow => {
                        // cada row tiene un contexto de binding
                        let oContext = oRow.getBindingContext();
                        if (!oContext) return;

                        let oData = oContext.getObject(); // datos de esa fila
                        let blockedCellValue = oData.BlockedQuantity;

                        // ahora buscás los controles dentro de la fila
                        let aCells = oRow.getCells();

                        aCells.forEach(oCell => {
                            let sId = oCell.getId();

                            if (sId.includes("Reason") && oCell.setValue) {
                                oCell.setValue("");
                                oCell.setValueState("None");
                            }

                            if (sId.includes("CostCenter") && oCell.setValue) {
                                oCell.setValue("");
                                oCell.setValueState("None");
                            }

                            if (sId.includes("freeQty") && oCell.setValue) {
                                oCell.setValue(parseInt("0").toFixed(3));
                            }

                            if (sId.includes("scrapQty") && oCell.setValue) {
                                oCell.setValue(blockedCellValue);
                            }
                        });
                    });

                    // limpiás selección
                    oTable.clearSelection(); // 👈 en ui.table.Table es este método
                    this.byId("MassFillFields").setEnabled(false);
                    this.byId("stockTransferBtn").setEnabled(false);
                    this.byId("scrapToFreeBtn").setEnabled(false);
                    return;
                }
            },

            _clearMassInputs: function () {
                const oTable = this.byId("smartTable").getTable();
                const oBinding = oTable.getBinding("rows");

                if (!oBinding) {
                    console.warn("No se encontró el binding de filas.");
                    return;
                }

                const aContexts = oBinding.getContexts(0, oBinding.getLength());
                const oModel = oBinding.getModel();

                aContexts.forEach(oContext => {
                    const sPath = oContext.getPath();

                    // Limpia directamente en el modelo
                    oModel.setProperty(sPath + "/Reason", "");
                    oModel.setProperty(sPath + "/CostCenter", "");
                });
            },

            setSmartFilters: function (mBindingParams, filterValues, filterKey) {
                let aFilters = filterValues.map(function (filterValue) {
                    let sValue = filterValue.trim();

                    if (sValue.startsWith("*") && sValue.endsWith("*")) {
                        return new sap.ui.model.Filter(filterKey, sap.ui.model.FilterOperator.Contains, sValue.slice(1, -1));
                    } else if (sValue.startsWith("*")) {
                        return new sap.ui.model.Filter(filterKey, sap.ui.model.FilterOperator.EndsWith, sValue.slice(1));
                    } else if (sValue.endsWith("*")) {
                        return new sap.ui.model.Filter(filterKey, sap.ui.model.FilterOperator.StartsWith, sValue.slice(0, -1));
                    } else {
                        return new sap.ui.model.Filter(filterKey, sap.ui.model.FilterOperator.EQ, sValue);
                    }
                });

                let oCombinedFilter = new sap.ui.model.Filter(aFilters, false);
                mBindingParams.filters.push(oCombinedFilter);
                this._exportFilters = [...(mBindingParams.filters || [])];
            },

            clearNotificationsPanel: function () {
                oMessagePopover.getModel().setData('');
                oMessagePopover.getModel().refresh(true);
                this.getView().getModel('popoverModel').getData().messageLength = '';
                this.getView().getModel('popoverModel').getData().type = "Default";
                this.byId('messagePopoverBtn').setEnabled(false);
                // this.byId('stockTransferBtn').setEnabled(false);
                this.getView().getModel('popoverModel').refresh(true);
            },

            checkTransferMovement: function () {
                this.clearNotificationsPanel();
                const oResourceBundle = this.getView().getModel("i18n").getResourceBundle();
                const blockedErrMsg = oResourceBundle.getText("blockedErrMsg");
                const emptyValesErrMsg = oResourceBundle.getText("emptyValuesMsg");
                let oTable = this.byId('table');
                let oItems = oTable.getSelectedItems();
                let regEx = /--([a-zA-Z]+)--([a-zA-Z]+)/;
                let errors = {
                    blocked: 0,
                    emptyFields: 0,
                    emptyValues: 0,
                }

                let postScrapData = { PostSet: [], ReturnSet: [] };
                let postFreeData = { PostSet: [], ReturnSet: [] };

                oItems.forEach(item => {
                    let oContext = item.getBindingContext();
                    let blockedVal = parseFloat(oContext.getProperty("BlockedQuantity"));
                    let scrapVal = parseFloat(item.getCells().filter(cell => cell.sId.includes('scrapQty'))[0].getValue());
                    let freeVal = parseFloat(item.getCells().filter(cell => cell.sId.includes('freeQty'))[0].getValue());
                    let reasonVal = item.getCells().filter(cell => cell.sId.includes('Reason'))[0].getValue();
                    let costCenterVal = item.getCells().filter(cell => cell.sId.includes('CostCenter'))[0].getValue();
                    let amountToTransfer = scrapVal + freeVal;

                    let data = {
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
                        Reason: reasonVal,
                        CostCenter: costCenterVal
                    }

                    if ((amountToTransfer > blockedVal) || scrapVal > blockedVal || freeVal > blockedVal) {
                        errors.blocked++
                        return;
                    }

                    if ((scrapVal > 0) && (!reasonVal || !costCenterVal)) {
                        // item.getCells().filter(cell => cell.getId().match(regEx)[2] === 'Reason')[0].setValueState('Error');
                        item.getCells().filter(cell => cell.sId.includes('Reason'))[0].setValueState('Error');
                        // item.getCells().filter(cell => cell.getId().match(regEx)[2] === 'CostCenter')[0].setValueState('Error');
                        item.getCells().filter(cell => cell.sId.includes('CostCenter'))[0].setValueState('Error');
                        errors.emptyFields++
                    }

                    if (scrapVal === 0 && freeVal === 0) {
                        errors.emptyValues++;
                        return;
                    }

                    if (reasonVal) {
                        item.getCells().filter(cell => cell.sId.includes('Reason'))[0].setValueState('None');
                    }

                    if (costCenterVal) {
                        item.getCells().filter(cell => cell.sId.includes('CostCenter'))[0].setValueState('None');
                    }


                    if (scrapVal > 0 && freeVal > 0) {
                        postScrapData.PostSet.push(data);
                        postFreeData.PostSet.push(data);
                    } else if (scrapVal > 0) {
                        postScrapData.PostSet.push(data);
                    } else if (freeVal > 0) {
                        postFreeData.PostSet.push(data);
                    }
                })

                if (errors.blocked > 0) {
                    sap.m.MessageBox.error(blockedErrMsg);
                    return;
                }
                if (errors.emptyValues > 0) {
                    sap.m.MessageBox.error(emptyValesErrMsg);
                    return;
                }

                if (errors.emptyFields > 0) return;

                this.postScrapMovement(postScrapData, postFreeData);
            },

            // SAP.UI.TABLE VARIANT
            // checkTransferMovement: function () {
            //     this.clearNotificationsPanel();
            //     const oResourceBundle = this.getView().getModel("i18n").getResourceBundle();
            //     const blockedErrMsg = oResourceBundle.getText("blockedErrMsg");
            //     const emptyValesErrMsg = oResourceBundle.getText("emptyValuesMsg");

            //     const oTable = this.byId("smartTable").getTable();
            //     const selectedIndices = oTable.getSelectedIndices();
            //     const regEx = /--([a-zA-Z]+)--([a-zA-Z]+)/;

            //     const errors = {
            //         blocked: 0,
            //         emptyFields: 0,
            //         emptyValues: 0,
            //     };

            //     const postScrapData = { PostSet: [], ReturnSet: [] };
            //     const postFreeData = { PostSet: [], ReturnSet: [] };

            //     selectedIndices.forEach(index => {
            //         const oContext = oTable.getContextByIndex(index);
            //         const row = oTable.getRows()[index];
            //         if (!oContext || !row) return;

            //         const rowCells = row.getCells();

            //         const getCellBySuffix = suffix =>
            //             rowCells.find(cell => cell.getId().split('-')[0] === suffix);

            //         const blockedVal = parseFloat(oContext.getProperty("BlockedQuantity"));
            //         const scrapVal = parseFloat(getCellBySuffix("ScrapQuantity")?.getValue() || 0);
            //         const freeVal = parseFloat(getCellBySuffix("FreeQuantity")?.getValue() || 0);
            //         const reasonVal = getCellBySuffix("Reason")?.getValue() || "";
            //         const costCenterVal = getCellBySuffix("CostCenter")?.getValue().trim() || "";
            //         const amountToTransfer = scrapVal + freeVal;

            //         const data = {
            //             Aufnr: oContext.getProperty("ProductionOrder"),
            //             Sortf: oContext.getProperty("ProductionOperation"),
            //             Charg: oContext.getProperty("Charg"),
            //             Idnrk: oContext.getProperty("Component"),
            //             Material: oContext.getProperty("Material"),
            //             ItemNumber: oContext.getProperty("ItemNumber"),
            //             Lgort: oContext.getProperty("StorageLocation"),
            //             Menge: oContext.getProperty("Quantity"),
            //             Qmart: oContext.getProperty("NotificationType"),
            //             Qmnum: oContext.getProperty("NotificationNumber"),
            //             Rsnum: oContext.getProperty("ReserveNumber"),
            //             Stlnr: oContext.getProperty("BomNumber"),
            //             Sernr: oContext.getProperty("SerialNumber"),
            //             UnitOfMeasure: oContext.getProperty("UnitOfMeasure"),
            //             Werks: oContext.getProperty("Plant"),
            //             WorkCtr: oContext.getProperty("WorkCenter"),
            //             Zblocked: oContext.getProperty("BlockedQuantity"),
            //             Zfree: freeVal.toFixed(3),
            //             Zscrap: scrapVal.toFixed(3),
            //             Zuser: oContext.getProperty("Zuser"),
            //             Reason: reasonVal,
            //             CostCenter: costCenterVal
            //         };

            //         if (amountToTransfer > blockedVal || scrapVal > blockedVal || freeVal > blockedVal) {
            //             errors.blocked++;
            //             return;
            //         }

            //         if (scrapVal > 0 && (!reasonVal || !costCenterVal)) {
            //             const reasonCell = getCellBySuffix("Reason");
            //             const costCenterCell = getCellBySuffix("CostCenter");
            //             if (reasonCell) reasonCell.setValueState("Error");
            //             if (costCenterCell) costCenterCell.setValueState("Error");
            //             errors.emptyFields++;
            //         }

            //         if (scrapVal === 0 && freeVal === 0) {
            //             errors.emptyValues++;
            //             return;
            //         }

            //         if (reasonVal) {
            //             const reasonCell = getCellBySuffix("Reason");
            //             if (reasonCell) reasonCell.setValueState("None");
            //         }

            //         if (costCenterVal) {
            //             const costCenterCell = getCellBySuffix("CostCenter");
            //             if (costCenterCell) costCenterCell.setValueState("None");
            //         }

            //         if (scrapVal > 0 && freeVal > 0) {
            //             postScrapData.PostSet.push(data);
            //             postFreeData.PostSet.push(data);
            //         } else if (scrapVal > 0) {
            //             postScrapData.PostSet.push(data);
            //         } else if (freeVal > 0) {
            //             postFreeData.PostSet.push(data);
            //         }
            //     });

            //     if (errors.blocked > 0) {
            //         sap.m.MessageBox.error(blockedErrMsg);
            //         return;
            //     }

            //     if (errors.emptyValues > 0) {
            //         sap.m.MessageBox.error(emptyValesErrMsg);
            //         return;
            //     }

            //     if (errors.emptyFields > 0) return;

            //     this.postScrapMovement(postScrapData, postFreeData);
            // },


            postScrapMovement: function (postScrapData, postFreeData) {
                const that = this;
                const oResourceBundle = this.getView().getModel("i18n").getResourceBundle();
                const busyDialogTitle = oResourceBundle.getText("busyDialogTitle");
                const notificationPanel = this.getView().byId('messagePopoverBtn');
                const freeMovementTitle = oResourceBundle.getText("freeMovements");
                const scrapMovementTitle = oResourceBundle.getText("scrapMovements");
                const oSmartTable = this.getView().byId('smartTable');
                const busyDialog4 = (sap.ui.getCore().byId("busy4")) ? sap.ui.getCore().byId("busy4") : new sap.m.BusyDialog('busy4', {
                    title: busyDialogTitle
                });

                busyDialog4.open();

                setTimeout(() => {
                    let sPath = '/ZfmPostScrapSet';
                    if (postScrapData.PostSet.length > 0) {
                        TransferService.callPostService(sPath, postScrapData).then(data => {
                            oMessagePopover.getModel().setData('');
                            let resMessages = data.ReturnSet.results.map(msgs => msgs);
                            let w_data = [];

                            resMessages.forEach(msg => {
                                let msgsTypes = that.setMessageType(msg.Type);
                                w_data.push({
                                    type: msgsTypes.T,
                                    title: scrapMovementTitle,
                                    subtitle: msgsTypes.subtitle,
                                    description: msg.Message
                                })
                            })

                            let prevMsgs = Array.from(oMessagePopover.getModel().getData());
                            let upDatedMsgs = [...prevMsgs, ...w_data];
                            oMessagePopover.getModel().setData(upDatedMsgs);
                            oMessagePopover.getModel().refresh(true);
                            that.getView().getModel('popoverModel').getData().messageLength = upDatedMsgs.length;
                            that.getView().getModel('popoverModel').getData().type = "Emphasized";
                            that.getView().getModel('popoverModel').refresh(true);

                            notificationPanel.setEnabled(true);
                            stockTransfer = true;
                            // that.handleCloseDialog();
                            oSmartTable.rebindTable();
                            busyDialog4.close();
                        }).catch((oError) => {
                            busyDialog4.close();
                            console.log(oError);
                        })
                    }

                    if (postFreeData.PostSet.length > 0) {
                        sPath = '/ZfmPostFreeSet';
                        TransferService.callPostService(sPath, postFreeData).then(data => {
                            let resMessages = data.ReturnSet.results.map(msgs => msgs);
                            let w_data = [];

                            resMessages.forEach(msg => {
                                let msgsTypes = that.setMessageType(msg.Type);
                                w_data.push({
                                    type: msgsTypes.T,
                                    title: freeMovementTitle,
                                    subtitle: msgsTypes.subtitle,
                                    description: msg.Message
                                })
                            })

                            let prevMsgs = Array.from(oMessagePopover.getModel().getData());
                            let upDatedMsgs = [...prevMsgs, ...w_data];
                            oMessagePopover.getModel().setData(upDatedMsgs);
                            oMessagePopover.getModel().refresh(true);
                            that.getView().getModel('popoverModel').getData().messageLength = upDatedMsgs.length;
                            that.getView().getModel('popoverModel').getData().type = "Emphasized";
                            that.getView().getModel('popoverModel').refresh(true);

                            notificationPanel.setEnabled(true);
                            stockTransfer = true;
                            // that.handleCloseDialog();
                            oSmartTable.rebindTable();
                            busyDialog4.close();
                            return;
                        }).catch((oError) => {
                            busyDialog4.close();
                            console.log(oError);
                        })
                    }
                }, 100);
            },

            onValueHelpMassFillDialog: function (oEvent) {
                let currId = oEvent.getSource().getId();
                let match = currId.match(/--([a-zA-Z]+)--([a-zA-Z]+)/);
                inputId = match[2];

                this.getFragment('MassFillFieldsHelpDialog').then(oFragment => {
                    oFragment.open();
                })
            },

            onDialogAfterOpen: function () {
                const oTable = this.byId('table');
                const flexBoxReferenceNumber = this.byId('ReferenceNumbersFb');
                const selectedItems = oTable.getSelectedItems();
                const referenceNumbers = AppJsonModel.getProperty('/ReferenceNumbers');

                const selectedObjects = selectedItems.map(item => item.getBindingContext().getObject());
                const currentRefNumbers = selectedObjects.map(item => item.ReferenceNumber);

                currentRefNumbers.forEach(refNumber => {
                    if (!refNumber) return;
                    referenceNumbers.push(refNumber);
                })

                const finalReferenceNumbers = Array.from(new Set(referenceNumbers));

                if (finalReferenceNumbers.length > 0) {
                    AppJsonModel.setProperty('/ReferenceNumbers', finalReferenceNumbers);
                    AppJsonModel.setInnerProperty('/Visible', 'ReferenceNumberVisible', true);
                }

                if (flexBoxReferenceNumber) {
                    flexBoxReferenceNumber.bindAggregation("items", "AppJsonModel>/ReferenceNumbers", function (sId, oContext) {
                        let aItems = oContext.getModel().getProperty("/ReferenceNumbers"); // Obtener la lista completa
                        let sValue = oContext.getObject(); // Obtener el valor actual
                        let iIndex = parseInt(oContext.getPath().split("/").pop()); // Obtener el índice del elemento

                        // Si NO es el último elemento, agrega el separador
                        return new sap.m.Text({
                            text: iIndex < aItems.length - 1 ? sValue + " | " : sValue
                        });
                    });
                }
            },

            onDialogAfterClose: function () {
                AppJsonModel.setProperty('/ReferenceNumbers', []);
                AppJsonModel.setInnerProperty('/Visible', 'ReferenceNumberVisible', false);
            },

            onValueHelpMassFillRequest: function (oEvent) {
                let currId = oEvent.getSource().getId();
                let match = currId.split('-').pop();
                inputId = match;
                currRowPosition = oEvent.getSource().getId().split('-').pop();

                let currSpath = this.getMatchCodePath(inputId);
                let oFilters = this.getCurrentFilter(inputId);
                this.getFragment(`MassFill${inputId}HelpDialog`).then(oFragment => {
                    oFragment.getTableAsync().then(function (oTable) {
                        oTable.setModel(MatchcodesService.getOdataModel());
                        let tableCols = AppJsonModel.getProperty(`/${inputId}`);
                        let currentJsonModel = new JSONModel({
                            "cols": tableCols
                        })

                        oTable.setModel(currentJsonModel, "columns");

                        if (oTable.bindRows) {
                            oTable.bindAggregation("rows", {
                                path: currSpath.path,
                                filters: oFilters,
                                showHeader: false
                            });
                        }

                        oFragment.update();

                    });
                    oFragment.open();
                })
            },

            onValueHelpOkPressMassFill: function (oEvent) {
                let reasonInput = this.byId("MassFill-Reason");
                let costCenterInput = this.byId("MassFill-CostCenter");

                let currValue;

                inputId === 'CostCenter'
                    ? currValue = oEvent.getParameter("tokens")[0].getCustomData()[0].getValue().costcenter
                    : currValue = oEvent.getParameter("tokens")[0].getKey()


                if (inputId === 'Reason') {
                    reasonInput.setValue(currValue);
                    reasonInput.setValueState('None');
                    this.onExitMassFillDialog();
                    return;
                }

                if (inputId === 'CostCenter') {
                    costCenterInput.setValue(currValue);
                    costCenterInput.setValueState('None');
                    this.onExitMassFillDialog();
                    return;
                }
            },

            onConfirmMassFillAction: function (oEvent) {
                // const that = this;
                // const oResourceBundle = this.getView().getModel("i18n").getResourceBundle();

                // selecteditems.forEach(item => {
                //     item.getCells().filter(cell => cell.getId().match(regex)).filter(item => item.sId.includes('Reason'))[0].setValue(reasonInput.getValue().trim());

                //     item.getCells().filter(cell => cell.getId().match(regex)).filter(item => item.sId.includes('CostCenter'))[0].setValue(costCenterInput.getValue().trim());
                // })

                // that.destroyFragments();
                // const regex = /--([a-zA-Z]+)--([a-zA-Z]+)/;

                const oTable = this.byId('table');
                const oModel = oTable.getModel();
                const sReason = this.byId('MassFill-Reason').getValue().trim();
                const sCostCenter = this.byId('MassFill-CostCenter').getValue().trim();
                const aItems = oTable.getSelectedItems();

                aItems.forEach(item => {
                    const oCtx = item.getBindingContext();
                    if (!oCtx) return;

                    const sPath = oCtx.getPath();

                    this._mMassChanges[sPath] = {
                        ...(this._mMassChanges[sPath] || {}),
                        Reason: sReason,
                        CostCenter: sCostCenter
                    };

                    // UI inmediata (rápida)
                    item.getCells().forEach(c => {
                        if (c.getId().includes("Reason")) c.setValue(sReason);
                        if (c.getId().includes("CostCenter")) c.setValue(sCostCenter);
                    });
                });

                this.destroyFragments();
            },

            // SAP.UI.TABLE VARIANT
            onConfirmMassFillActionUiTable: function (oEvent) {
                const that = this;
                const oTable = this.byId("idUiTable");
                const oResourceBundle = this.getView().getModel("i18n").getResourceBundle();
                const regex = /--([a-zA-Z]+)--([a-zA-Z]+)/;
                const reasonInput = this.byId("MassFill-Reason");
                const costCenterInput = this.byId("MassFill-CostCenter");

                // obtener índices seleccionados
                const aSelectedIndices = oTable.getSelectedIndices();

                aSelectedIndices.forEach(iIndex => {
                    // obtener la fila visible (ojo con el scroll)
                    let oRow = oTable.getRows()[iIndex - oTable.getFirstVisibleRow()];
                    if (!oRow) return;

                    let aCells = oRow.getCells();

                    // completar Reason
                    let oReasonCell = aCells
                        .filter(cell => cell.getId().match(regex))
                        .find(cell => cell.sId.includes("Reason"));
                    if (oReasonCell && oReasonCell.setValue) {
                        oReasonCell.setValue(reasonInput.getValue().trim());
                    }

                    // completar CostCenter
                    let oCostCenterCell = aCells
                        .filter(cell => cell.getId().match(regex))
                        .find(cell => cell.sId.includes("CostCenter"));
                    if (oCostCenterCell && oCostCenterCell.setValue) {
                        oCostCenterCell.setValue(costCenterInput.getValue().trim());
                    }
                });

                that.destroyFragments();
            },

            onValueHelpRequest: function (oEvent) {
                let currId = oEvent.getSource().getId();
                let match = currId.match(/--([a-zA-Z]+)--([a-zA-Z]+)/);
                inputId = match[2];
                currRowPosition = oEvent.getSource().getId().split('').pop();

                let currSpath = this.getMatchCodePath(inputId);
                let oFilters = this.getCurrentFilter(inputId);
                this.getFragment(`${inputId}HelpDialog`).then(oFragment => {
                    oFragment.getTableAsync().then(function (oTable) {
                        oTable.setModel(MatchcodesService.getOdataModel());
                        let tableCols = AppJsonModel.getProperty(`/${inputId}`);
                        let currentJsonModel = new JSONModel({
                            "cols": tableCols
                        })

                        oTable.setModel(currentJsonModel, "columns");
                        // oTable.getExtension()[0].getContent()[2].setVisible(false);

                        const tableType = oTable.getMetadata().getName();
                        if (tableType === "sap.ui.table.Table") {
                            oTable.setSelectionMode(sap.ui.table.SelectionMode.MultiToggle);
                        } else if (tableType === "sap.m.Table") {
                            oTable.setMode("MultiSelect");
                        }

                        if (oTable.bindRows) {
                            oTable.bindAggregation("rows", {
                                path: currSpath.path,
                                filters: oFilters,
                                showHeader: false
                            });
                        }

                        oFragment.update();

                    });
                    oFragment.open();
                })
            },

            // SAP.UI.TABLE VARIANT
            // onValueHelpRequest: function (oEvent) {
            //     let oInput = oEvent.getSource();
            //     let currId = oInput.getId();
            //     let match = currId.match(/--([a-zA-Z]+)--([a-zA-Z]+)/);
            //     inputId = match ? match[2] : "";

            //     if (inputId === '') return;

            //     let currSpath = this.getMatchCodePath(inputId);
            //     let oFilters = this.getCurrentFilter(inputId);

            //     this.getFragment(`${inputId}HelpDialog`).then(oFragment => {
            //         oFragment.getTableAsync().then(function (oTable) {
            //             oTable.setModel(MatchcodesService.getOdataModel());

            //             let tableCols = AppJsonModel.getProperty(`/${inputId}`);
            //             let currentJsonModel = new JSONModel({ "cols": tableCols });

            //             oTable.setModel(currentJsonModel, "columns");

            //             if (oTable.bindRows) {
            //                 oTable.bindAggregation("rows", {
            //                     path: currSpath.path,
            //                     filters: oFilters,
            //                     showHeader: false
            //                 });
            //             }

            //             oFragment.update();
            //         });

            //         oFragment.open();
            //     });
            // },

            onValueHelpRequestInputsTable: async function (oEvent) {
                let oInput = oEvent.getSource();
                let currId = oInput.getId().split('-').filter(item => item === 'Reason' || item === 'CostCenter')[0]

                inputId = currId ? currId : '';

                let sPath;
                if (inputId === 'CostCenter') {
                    sPath = await this.checkCostCenterPath(oInput)
                }

                // Obtener tabla y fila
                let oTable = this.byId("table");
                let oRow = oInput.getParent(); // parent del input es una celda, y su parent es la fila

                // Obtener índice visible de la fila
                currRowPosition = oTable.getItems().indexOf(oRow); // Índice absoluto en la tabla

                if (currRowPosition === -1) {
                    console.warn("No se pudo determinar la fila para el Value Help.");
                    return;
                }

                let currSpath = this.getMatchCodePath(inputId);
                let oFilters = this.getCurrentFilter(inputId);

                if (sPath.path === '/MatchCodePlant') {
                    this.getFragment(`${inputId}HelpDialog`).then(oFragment => {
                        oFragment.getTableAsync().then(function (oTable) {
                            oTable.setModel(MatchcodesService.getOdataModel());

                            let tableCols = AppJsonModel.getProperty(`/${inputId}`);
                            let currentJsonModel = new JSONModel({ "cols": tableCols });

                            oTable.setModel(currentJsonModel, "columns");

                            if (oTable.bindRows) {
                                oTable.bindAggregation("rows", {
                                    path: inputId === 'CostCenter' ? sPath.path : currSpath.path,
                                    filters: sPath.filters,
                                    showHeader: false
                                });
                            }

                            oFragment.update();
                        });

                        oFragment.open();
                        return;
                    });
                } else {
                    this.getFragment('CostCenterOldHelpDialog').then(oFragment => {
                        oFragment.getTableAsync().then(function (oTable) {
                            oTable.setModel(MatchcodesService.getOdataModel());

                            let tableCols = AppJsonModel.getProperty('/CostCenterOld');
                            let currentJsonModel = new JSONModel({ "cols": tableCols });

                            oTable.setModel(currentJsonModel, "columns");

                            if (oTable.bindRows) {
                                oTable.bindAggregation("rows", {
                                    path: sPath,
                                    filters: oFilters,
                                    showHeader: false
                                });
                            }

                            oFragment.update();
                        });

                        oFragment.open();
                        return;
                    });
                }
            },

            checkCostCenterPath: async function (oInput) {
                const currWorkcenter = oInput.getBindingContext().getObject().WorkCenter;
                const currentPlant = oInput.getBindingContext().getObject().Plant;
                const aFilter = [new Filter('workcenter', FilterOperator.EQ, currWorkcenter), new Filter('plant', FilterOperator.EQ, currentPlant)];

                const sPath = MatchcodesService.callGetService('/MatchCodePlant', aFilter).then(data => {
                    if (data.results.length > 0) {
                        return { path: '/MatchCodePlant', filters: aFilter };
                    }

                    return '/MatchCodeCostCenter';
                });

                return sPath;
            },
            onValueHelpOkPress: function (oEvent) {
                const oTable = this.byId('table');
                const regex = /--([a-zA-Z]+)--([a-zA-Z]+)/;
                let currValue;

                if (inputId === 'CostCenter') {
                    if (!oEvent.getParameter("tokens")[0].getCustomData()[0].getValue().costcenter) {
                        currValue = oEvent.getParameter("tokens")[0].getCustomData()[0].getValue().CostCenter
                    } else {
                        currValue = currValue = oEvent.getParameter("tokens")[0].getCustomData()[0].getValue().costcenter;
                    }
                }

                let rowSelected = oTable.getItems()[currRowPosition];
                let tokensSelected = oEvent.getParameter('tokens').map(token => ({ key: token.getKey(), text: token.getText() }));
                let oCtx = rowSelected.getBindingContext();

                if (!oCtx) {
                    this.onExitDialog();
                    return;
                }

                const oModel = oCtx.getModel();
                const sRowPath = oCtx.getPath();
                oModel.setProperty(`${sRowPath}/${inputId}`, currValue);

                const oInput = rowSelected.getCells().find(c => c.getId().includes(inputId));

                if (oInput) {
                    oInput.setValueState("None");
                }


                if (inputId !== 'Reason' && inputId !== 'CostCenter') {
                    AppJsonModel.setInnerProperty('/FilterValues', inputId, tokensSelected);
                    this.onExitDialog();
                    return;
                }

                this.onExitDialog();
            },

            onValueHelpOkPressSmartTableFilters: function (oEvent) {
                let currId = inputId;

                let tokensSelected = oEvent.getParameter('tokens').map(token => ({ key: token.getKey(), text: token.getText() }));
                AppJsonModel.setInnerProperty('/FilterValues', currId, tokensSelected);
                this.onExitDialog();
                return;
            },

            // SAP.UI.TABLE VARIANT
            // onValueHelpOkPress: function (oEvent) {
            //     const oTable = this.byId("smartTable").getTable();
            //     const regex = /--([a-zA-Z]+)--([a-zA-Z]+)/;

            //     const currValue = oEvent.getParameter("tokens")[0].getKey();
            //     const tokenData = oEvent.getParameter("tokens")[0].getCustomData();

            //     if (inputId === "ProductionOrder") {
            //         let currMaterial = tokenData[0].getValue().Material;
            //         this.byId(inputId).setValue(currValue);
            //         // this.byId("Material").setValue(currMaterial);
            //         this.onExitDialog();
            //         return;
            //     }

            //     if (inputId !== "Reason" && inputId !== "CostCenter") {
            //         this.byId(inputId).setValue(currValue);
            //         this.onExitDialog();
            //         return;
            //     }

            //     // Accedemos a la fila seleccionada por índice
            //     const oRow = oTable.getRows()[currRowPosition];

            //     if (!oRow) {
            //         console.warn("No se encontró la fila para el índice:", currRowPosition);
            //         return;
            //     }

            //     // Encontramos el input dentro de la celda correspondiente a inputId
            //     const oCell = oRow.getCells().find(cell => {
            //         const cellId = cell.getId().split('-')[0];
            //         return cellId === inputId;
            //     });

            //     if (oCell && oCell.setValue) {
            //         oCell.setValue(currValue);
            //         oCell.setValueState("None");
            //     }

            //     this.onExitDialog();
            // },

            onFilterBarSearch: function (oEvent) {
                let aSelectionSet = oEvent.getParameter("selectionSet");
                let aFilters = this.setProdOrderFilters(aSelectionSet);

                this.getFragment(`${inputId}HelpDialog`).then(oFragment => {
                    let oBindingInfo = oFragment.getTable().getBinding("rows");

                    if (aFilters.length) {
                        let oFilters = new Filter({
                            filters: aFilters,
                            and: true // false
                        });

                        oBindingInfo.filter(oFilters);
                        oFragment.update();
                        return;
                    }

                    oBindingInfo.filter([]);
                    oFragment.update();
                })
            },

            onFilterBarSearchOldCostCenter: function (oEvent) {
                let aSelectionSet = oEvent.getParameter("selectionSet");
                let aFilters = this.setProdOrderFilters(aSelectionSet);

                this.getFragment('CostCenterOldHelpDialog').then(oFragment => {
                    let oBindingInfo = oFragment.getTable().getBinding("rows");

                    if (aFilters.length) {
                        let oFilters = new Filter({
                            filters: aFilters,
                            and: true // false
                        });

                        oBindingInfo.filter(oFilters);
                        oFragment.update();
                        return;
                    }

                    oBindingInfo.filter([]);
                    oFragment.update();
                })
            },

            onFilterBarSearchMassFill: function (oEvent) {
                let aSelectionSet = oEvent.getParameter("selectionSet");
                let aFilters = this.setProdOrderFilters(aSelectionSet);

                this.getFragment(`MassFill${inputId}HelpDialog`).then(oFragment => {
                    let oBindingInfo = oFragment.getTable().getBinding("rows");

                    if (aFilters.length) {
                        let oFilters = new Filter({
                            filters: aFilters,
                            and: true // false
                        });

                        oBindingInfo.filter(oFilters);
                        oFragment.update();
                        return;
                    }

                    oBindingInfo.filter([]);
                    oFragment.update();
                })
            },

            setProdOrderFilters: function (fields) {
                let filters = fields.reduce((aResult, oControl) => {
                    if ((!oControl.getValue().startsWith("*") && !oControl.getValue().endsWith("*"))) {
                        aResult.push(new Filter(oControl.getName(), FilterOperator.Contains, oControl.getValue()));
                        return aResult;
                    }

                    if (oControl.getValue().startsWith("*") && oControl.getValue().endsWith("*")) {
                        aResult.push(new Filter(oControl.getName(), FilterOperator.Contains, oControl.getValue().slice(1, - 1)));
                        return aResult;
                    }

                    if (oControl.getValue().startsWith("*")) {
                        aResult.push(new Filter(oControl.getName(), FilterOperator.EndsWith, oControl.getValue().slice(1)));
                        return aResult;
                    }

                    if (oControl.getValue().endsWith("*")) {
                        aResult.push(new Filter(oControl.getName(), FilterOperator.StartsWith, oControl.getValue().slice(0, -1)));
                        return aResult;
                    }

                    return aResult;
                }, []);

                return filters;
            },

            onSubmitFilter: function (oEvent) {
                let currName = oEvent.getSource().getName();
                let currValue = oEvent.getParameter("value");
                let aFilters = [];

                if (!currValue.startsWith('*') && !currValue.endsWith('*')) {
                    aFilters.push(new Filter(currName, FilterOperator.Contains, currValue));
                } else if (currValue.startsWith('*') && currValue.endsWith('*')) {
                    aFilters.push(new Filter(currName, FilterOperator.Contains, currValue.slice(1, -1)));
                } else if (currValue.startsWith('*')) {
                    aFilters.push(new Filter(currName, FilterOperator.EndsWith, currValue.slice(1)));
                } else if (currValue.endsWith('*')) {
                    aFilters.push(new Filter(currName, FilterOperator.StartsWith, currValue.slice(0, -1)));
                }

                this.getFragment(`${inputId}HelpDialog`).then(oFragment => {
                    let oBindingInfo = oFragment.getTable().getBinding("rows");

                    if (aFilters.length) {
                        let oFilters = new Filter({
                            filters: aFilters,
                            and: true // false
                        });

                        oBindingInfo.filter(oFilters);
                        oFragment.update();
                        return;
                    }

                    oBindingInfo.filter([]);
                    oFragment.update();
                })
            },

            onSubmitFilterOldCostCenter: function (oEvent) {
                let currName = oEvent.getSource().getName();
                let currValue = oEvent.getParameter("value");
                let aFilters = [];

                if (!currValue.startsWith('*') && !currValue.endsWith('*')) {
                    aFilters.push(new Filter(currName, FilterOperator.Contains, currValue));
                } else if (currValue.startsWith('*') && currValue.endsWith('*')) {
                    aFilters.push(new Filter(currName, FilterOperator.Contains, currValue.slice(1, -1)));
                } else if (currValue.startsWith('*')) {
                    aFilters.push(new Filter(currName, FilterOperator.EndsWith, currValue.slice(1)));
                } else if (currValue.endsWith('*')) {
                    aFilters.push(new Filter(currName, FilterOperator.StartsWith, currValue.slice(0, -1)));
                }

                this.getFragment('CostCenterOldHelpDialog').then(oFragment => {
                    let oBindingInfo = oFragment.getTable().getBinding("rows");

                    if (aFilters.length) {
                        let oFilters = new Filter({
                            filters: aFilters,
                            and: true // false
                        });

                        oBindingInfo.filter(oFilters);
                        oFragment.update();
                        return;
                    }

                    oBindingInfo.filter([]);
                    oFragment.update();
                })
            },

            onSubmitMassFillFilters: function (oEvent) {
                let currName = oEvent.getSource().getName();
                let currValue = oEvent.getParameter("value");
                let aFilters = [];

                if (!currValue.startsWith('*') && !currValue.endsWith('*')) {
                    aFilters.push(new Filter(currName, FilterOperator.Contains, currValue));
                } else if (currValue.startsWith('*') && currValue.endsWith('*')) {
                    aFilters.push(new Filter(currName, FilterOperator.Contains, currValue.slice(1, -1)));
                } else if (currValue.startsWith('*')) {
                    aFilters.push(new Filter(currName, FilterOperator.EndsWith, currValue.slice(1)));
                } else if (currValue.endsWith('*')) {
                    aFilters.push(new Filter(currName, FilterOperator.StartsWith, currValue.slice(0, -1)));
                }

                this.getFragment(`MassFill${inputId}HelpDialog`).then(oFragment => {
                    let oBindingInfo = oFragment.getTable().getBinding("rows");

                    if (aFilters.length) {
                        let oFilters = new Filter({
                            filters: aFilters,
                            and: true // false
                        });

                        oBindingInfo.filter(oFilters);
                        oFragment.update();
                        return;
                    }

                    oBindingInfo.filter([]);
                    oFragment.update();
                })
            },

            onValueHelpSearch: function (oEvent) {
                let sValue = oEvent.getParameter("value");
                let oFilter = [];

                if (sValue !== '') {
                    oFilter = new Filter("Grtxt", FilterOperator.Contains, sValue);
                }

                oEvent.getSource().getBinding("items").filter([oFilter]);
            },

            onValueHelpClose: function (oEvent) {
                const oSelectedItem = oEvent.getParameter("selectedItem");
                let currentValue = oSelectedItem.getTitle();
                let currentDescription = oSelectedItem.getDescription();

                oEvent.getSource().getBinding("items").filter([]);

                if (!oSelectedItem) {
                    return;
                }

                this.byId("reasonMovementInput").setValue(currentValue);
                this.byId("reasonMovementInput").setDescription(currentDescription);
            },

            onExitMassFillDialog: function () {
                this.getFragment(`MassFill${inputId}HelpDialog`).then(function (oFragment) {
                    oFragment.close();
                });
            },

            onExitDialog: function () {
                const referenceNumbers = AppJsonModel.getProperty('/ReferenceNumbers');

                if (referenceNumbers.length > 0) {
                    AppJsonModel.setProperty('/ReferenceNumbers', []);
                    AppJsonModel.setInnerProperty('/Visible', 'ReferenceNumberVisible', false);
                }

                this.getFragment(`${inputId}HelpDialog`).then(function (oFragment) {
                    oFragment.close();
                });

                this.destroyFragments();
            },

            _closeDialog: function (sName) {
                let oView = this.getView();
                let reasonInput = this.getView().byId('reasonMovementInput');

                // creates requested dialog if not yet created
                if (!this._mDialogs[sName]) {
                    this._mDialogs[sName] = Fragment.load({
                        id: oView.getId(),
                        name: "zdomscrapmovements.view.fragments.StockTransfer" + sName,
                        controller: this
                    }).then(function (oDialog) {
                        oView.addDependent(oDialog);
                        if (fInit) {
                            fInit(oDialog);
                        }
                        return oDialog;
                    });
                }
                this._mDialogs[sName].then(function (oDialog) {
                    reasonInput.setValue('');
                    reasonInput.setDescription('');
                    reasonInput.setValueState('None');
                    reasonInput.setValueStateText('');
                    oDialog.close();
                });
            },

            _openDialog: function (sName, sPage, fInit) {
                var oView = this.getView();

                // creates requested dialog if not yet created
                if (!this._mDialogs[sName]) {
                    this._mDialogs[sName] = Fragment.load({
                        id: oView.getId(),
                        name: "zdomscrapmovements.view.fragment.StockTransfer" + sName,
                        controller: this
                    }).then(function (oDialog) {
                        oView.addDependent(oDialog);
                        if (fInit) {
                            fInit(oDialog);
                        }
                        return oDialog;
                    });
                }
                this._mDialogs[sName].then(function (oDialog) {
                    // opens the requested dialog
                    oDialog.open(sPage);
                });
            },

            destroyFragments: function () {
                if (this.oFragments) {
                    Object.keys(this.oFragments).forEach(function (sKey) {
                        this.oFragments[sKey].destroy();
                        delete this.oFragments[sKey];
                    }, this);
                }
            },

            onChange: function (oEvent) {
                let currentId = oEvent.getSource().getId().split('-').pop();
                let mayus = oEvent.getSource().getValue().toUpperCase();

                if (!mayus.trim()) return;

                let token = { key: mayus, text: mayus };
                this.byId(currentId).setValue('');

                let currentValues = AppJsonModel.getProperty('/FilterValues')[`${currentId}`];
                if (currentValues) {
                    currentValues.push(token)
                    AppJsonModel.setInnerProperty('/FilterValues', currentId, currentValues);
                    return
                }
                AppJsonModel.setInnerProperty('/FilterValues', currentId, [token]);
            },

            onTokenUpdate: function (oEvent) {
                let currId = oEvent.getSource().getId().split('-').pop();
                let currentTokens = AppJsonModel.getProperty('/FilterValues')[`${currId}`];
                let removedToken = oEvent.getParameter('removedTokens')[0].getKey();
                let tokensUpdated = currentTokens.filter(token => token.key !== removedToken);
                AppJsonModel.setInnerProperty('/FilterValues', currId, tokensUpdated);
            },

            onMultiInputSubmit: function (oEvent) {
                let currentId = oEvent.getSource().getId().split('-').pop();
                let mayus = oEvent.getSource().getValue().toUpperCase();

                if (!mayus.trim()) return;

                let token = { key: mayus, text: mayus };
                this.byId(currentId).setValue('');

                let currentValues = AppJsonModel.getProperty('/FilterValues')[`${currentId}`];
                currentValues.push(token);

                currentValues ? AppJsonModel.setInnerProperty('/FilterValues', currentId, [...currentValues, token]) : AppJsonModel.setInnerProperty('/FilterValues', currentId, [token]);
            },

            onReasonChange: function (oEvent) {
                const oTable = this.byId('table');
                const regEx = /--([a-zA-Z]+)--([a-zA-Z]+)/;

                let filteredItems = oTable.getItems().filter(item => item.sId.includes("MainView"));
                let currValue = oEvent.getParameter("value");
                let currInputPosition = oEvent.getSource().getId().split('-').pop();
                let currentRow = filteredItems[currInputPosition];

                if (!currValue) return;

                if (currValue) {
                    currentRow.getCells().filter(cell => cell.getId().match(regEx)[2] === 'Reason')[0].setValueState('None');
                }
            },

            onCostCenterChange: function (oEvent) {
                const oInput = oEvent.getSource();
                const oCtx = oInput.getBindingContext();

                if (!oCtx) return;

                const sPath = oCtx.getPath();
                const oModel = oCtx.getModel();


                // Nombre del campo desde el ID del input
                const sProp =
                    oInput.getId().includes("scrapQty") ? "ScrapQuantity" :
                        oInput.getId().includes("freeQty") ? "FreeQuantity" :
                            oInput.getId().includes('CostCenter') ? 'CostCenter' :
                                oInput.getId().includes('Reason') ? 'Reason' :
                                    null;

                if (!sProp) return;

                oModel.setProperty(sPath + "/" + sProp, oInput.getValue());
            },

            onFormatValue: function (oEvent) {
                const oInput = oEvent.getSource();
                const oCtx = oInput.getBindingContext();

                if (!oCtx) return;

                const sPath = oCtx.getPath();
                const oModel = oCtx.getModel();


                // Nombre del campo desde el ID del input
                const sProp =
                    oInput.getId().includes("scrapQty") ? "ScrapQuantity" :
                        oInput.getId().includes("freeQty") ? "FreeQuantity" :
                            null;

                if (!sProp) return;

                let currValue = oEvent.getSource().getValue();

                if (currValue.trim() === '') {
                    let newValue = parseInt(0).toFixed(3);
                    oEvent.getSource().setValue(newValue);
                    return;
                }

                let parseValue = parseFloat(currValue);
                oModel.setProperty(sPath + "/" + sProp, parseValue.toFixed(3));
                // oEvent.getSource().setValue(parseValue.toFixed(3));
            },

            handleOpenDialog: function () {
                this._openDialog("Dialog");
            },

            handleCloseDialog: function () {
                this._closeDialog('Dialog');
            },

            handelConfirm: function (oEvent) {
                if (oEvent.getParameters().filterString) {
                    MessageToast.show(oEvent.getParameters().filterString);
                }
            },

            handleMessagePopoverPress: function (oEvent) {
                oMessagePopover.toggle(oEvent.getSource());
            },

            // onSmartTableExportPress: async function () {
            //     try {
            //         const oSmartTable = this.byId("smartTable");
            //         const oInnerTable = oSmartTable.getTable();
            //         let oBinding = oInnerTable.getBinding("rows") || oInnerTable.getBinding("items");

            //         if (!oBinding) {
            //             sap.m.MessageToast.show("No hay datos disponibles para exportar.");
            //             return;
            //         }

            //         sap.ui.core.BusyIndicator.show(0);

            //         // --- Asegurar carga completa ---
            //         const iTotal = oBinding.getLength();

            //         if (iTotal > 1500) {
            //             await new Promise(resolve => {
            //                 const fnHandler = () => {
            //                     try { oBinding.detachDataReceived(fnHandler); } catch (e) { }
            //                     resolve();
            //                 };
            //                 try { oBinding.attachDataReceived(fnHandler); } catch (e) { resolve(); }
            //                 try {
            //                     oBinding.getContexts(0, iTotal > 0 ? iTotal : 100000);
            //                 } catch (e) {
            //                     console.warn("getContexts lanzó excepción:", e);
            //                     resolve();
            //                 }
            //             });
            //         }

            //         // --- Obtener todos los datos ---
            //         const aContexts = oBinding.getContexts(0, iTotal > 0 ? iTotal : 10000);
            //         const aExportData = [];

            //         aContexts.forEach(ctx => {
            //             const oObj = ctx?.getObject?.();
            //             if (!oObj) return;

            //             const row = { ...oObj };

            //             // Aplicar formatters
            //             row.NotificationCreationDate = parseToDate(row.NotificationCreationDate);
            //             row.NotificationCreationTime = parseTime(row.NotificationCreationTime);
            //             row.Time = parseTime(row.Time);

            //             aExportData.push(row);
            //         });

            //         const aColumns = this.getColumnsFromTable(oInnerTable);

            //         // --- Configurar exportación ---
            //         const oExportSettings = {
            //             workbook: { columns: aColumns },
            //             dataSource: aExportData,
            //             fileName: "Export_ScrapMovements.xlsx"
            //         };

            //         // --- Generar Excel ---
            //         const oSheet = new Spreadsheet(oExportSettings);
            //         await oSheet.build();
            //         oSheet.destroy();
            //     } catch (error) {
            //         console.error("Error en exportación:", error);
            //         sap.m.MessageToast.show("Error en exportación: " + error.message);
            //     } finally {
            //         sap.ui.core.BusyIndicator.hide();
            //     }

            //     // === Helpers ===

            //     function parseToDate(raw) {
            //         if (raw == null || raw === "") return null;
            //         if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;

            //         const s = String(raw).trim();
            //         let m = /\/Date\((\d+)(?:[+-]\d+)?\)\//.exec(s);
            //         if (m) return new Date(parseInt(m[1], 10));

            //         if (/^\d{8}$/.test(s)) {
            //             const year = parseInt(s.slice(0, 4), 10);
            //             const month = parseInt(s.slice(4, 6), 10) - 1;
            //             const day = parseInt(s.slice(6, 8), 10);
            //             return new Date(year, month, day);
            //         }

            //         m = /^(\d{4})[-\/](\d{2})[-\/](\d{2})/.exec(s);
            //         if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));

            //         const d2 = new Date(s);
            //         return isNaN(d2.getTime()) ? null : d2;
            //     }

            //     function parseTime(vMs) {
            //         if (vMs == null || vMs === "") return "";
            //         let ms = typeof vMs === "object" ? vMs.ms : vMs;
            //         if (typeof ms === "string" && ms.startsWith("PT")) {
            //             // formato OData PTxxHxxMxxS
            //             const regex = /PT(\d+)H(\d+)M(\d+)S/;
            //             const match = regex.exec(ms);
            //             if (match) {
            //                 const [_, h, m, s] = match;
            //                 return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:${s.padStart(2, "0")}`;
            //             }
            //         }
            //         if (isNaN(ms)) return vMs;
            //         let totalSeconds = Math.floor(ms / 1000);
            //         let hours = Math.floor(totalSeconds / 3600);
            //         let minutes = Math.floor((totalSeconds % 3600) / 60);
            //         let seconds = totalSeconds % 60;
            //         return `${hours.toString().padStart(2, "0")}:${minutes
            //             .toString()
            //             .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
            //     }
            // },

            // getColumnsFromResponsiveTable: function (oInnerTable) {
            //     const aColumns = [];

            //     oInnerTable.getColumns().forEach(col => {
            //         let sLabel = "";
            //         let sProperty = "";

            //         // === Obtener label ===
            //         const oHeader = col.getHeader && col.getHeader();
            //         if (oHeader) {
            //             if (typeof oHeader.getText === "function") {
            //                 sLabel = oHeader.getText();
            //             } else if (typeof oHeader === "string") {
            //                 sLabel = oHeader;
            //             }
            //         }

            //         // === Obtener property desde customData (p13nData) ===
            //         const aCustomData = col.getCustomData && col.getCustomData();
            //         if (Array.isArray(aCustomData)) {
            //             aCustomData.forEach(cd => {
            //                 const key = cd.getKey && cd.getKey();
            //                 if (key === "p13nData") {
            //                     try {
            //                         const v = cd.getValue();
            //                         const parsed = typeof v === "string" ? JSON.parse(v) : v;
            //                         if (parsed && (parsed.leadingProperty || parsed.columnKey)) {
            //                             sProperty = parsed.leadingProperty || parsed.columnKey;
            //                         }
            //                     } catch (e) {
            //                         console.warn("Error parseando p13nData:", e);
            //                     }
            //                 }
            //             });
            //         }

            //         if (!sProperty) return;

            //         aColumns.push({
            //             label: sLabel || sProperty,
            //             property: sProperty,
            //             type: this.deduceColumnType(sProperty)
            //         });
            //     });

            //     return aColumns;
            // },

            getColumnsFromTable: function (oInnerTable) {

                // Obtener columnas ordenadas según como se ven en pantalla
                const aUIColumns = oInnerTable.getColumns()
                    .slice()
                    .sort((a, b) => a.getOrder() - b.getOrder());

                const aColumns = [];

                aUIColumns.forEach((col, index) => {
                    let sLabel = "";
                    let sProperty = "";

                    // === Obtener label ===
                    const oHeader = col.getHeader && col.getHeader();
                    if (oHeader) {
                        if (typeof oHeader.getText === "function") {
                            sLabel = oHeader.getText();
                        } else if (typeof oHeader === "string") {
                            sLabel = oHeader;
                        }
                    }

                    // === Obtener property desde customData (p13nData) ===
                    const aCustomData = col.getCustomData && col.getCustomData();
                    if (Array.isArray(aCustomData)) {
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
                        });
                    }

                    // === Si la columna no tiene propiedad, igual se reserva su posición ===
                    if (!sProperty) {
                        aColumns[index] = null; // mantener orden
                        return;
                    }

                    // === Determinar tipo de columna y formato ===
                    const oColDef = {
                        label: sLabel || sProperty,
                        property: sProperty,
                        width: 20
                    };

                    // === Números: 3 primeras columnas + Quantity ===
                    if (["BlockedQuantity", "ScrapQuantity", "FreeQuantity", "Quantity"].includes(sProperty)) {
                        oColDef.type = sap.ui.export.EdmType.Number;
                        oColDef.scale = 3; // mostrar 3 decimales fijos (puedes cambiarlo a 2)
                        oColDef.delimiter = true; // separador de miles
                    }

                    // === Fechas ===
                    if (["DateFrom", "DateTo", "NotificationCreationDate"].includes(sProperty)) {
                        oColDef.type = sap.ui.export.EdmType.Date;
                    }

                    // === Horas ===
                    if (["Time", "NotificationCreationTime"].includes(sProperty)) {
                        oColDef.type = sap.ui.export.EdmType.Time;
                    }

                    aColumns.push(oColDef);
                });

                return aColumns;
            },

            // === Tipado básico según nombre del campo ===
            deduceColumnType: function (prop) {
                if (/date/i.test(prop)) return sap.ui.export.EdmType.Date;
                if (/time/i.test(prop)) return sap.ui.export.EdmType.String;
                if (/qty|quantity|amount|number|value/i.test(prop)) return sap.ui.export.EdmType.Number;
                return sap.ui.export.EdmType.String;
            },

            onDiscardLinesButtonPress: function (oEvent) {

            },

            // onSmartTableExportPress: async function () {
            //     let that = this;

            //     try {
            //         const oSmartTable = this.byId("smartTable");
            //         const oSmartFilterBar = this.byId("smartFilterBar");
            //         const oInnerTable = oSmartTable.getTable();
            //         let oBinding = oInnerTable.getBinding("rows") || oInnerTable.getBinding("items");


            //         if (!oBinding) {
            //             sap.m.MessageToast.show("No hay datos disponibles para exportar.");
            //             return;
            //         }



            //         sap.ui.core.BusyIndicator.show(0);

            //         // ========= Obtener modelo, path, filtros y sorters =========
            //         const oModel = oBinding.getModel();
            //         const sPath = oBinding.getPath();
            //         const aFilters = this._exportFilters || [];
            //         // ========= Traer TODOS los datos del backend, en páginas =========
            //         const aExportDataRaw = await fetchAllData(oModel, sPath, aFilters);

            //         // ========= Aplicar formatters =========
            //         const aExportData = aExportDataRaw.map((oObj, index) => {
            //             return {
            //                 ...oObj,
            //                 NotificationCreationDate: parseToDate(oObj.NotificationCreationDate),
            //                 NotificationCreationTime: parseTime(oObj.NotificationCreationTime),
            //                 // ScrapQuantity: parseInputsData(index, 'scrapQty'),
            //                 // FreeQuantity: parseInputsData(index, 'freeQty'),
            //                 // Reason: parseInputsData(index, 'Reason'),
            //                 // CostCenter: parseInputsData(index, 'CostCenter'),
            //                 Time: parseTime(oObj.Time)
            //             };
            //         });

            //         // ========= Columnas del Excel =========
            //         const aColumns = this.getColumnsFromTable(oInnerTable);

            //         // ========= Exportación =========
            //         const oExportSettings = {
            //             workbook: { columns: aColumns },
            //             dataSource: aExportData,
            //             fileName: "Export_ScrapMovements.xlsx"
            //         };

            //         const oSheet = new Spreadsheet(oExportSettings);
            //         await oSheet.build();
            //         oSheet.destroy();

            //     } catch (error) {
            //         console.error("Error en exportación:", error);
            //         sap.m.MessageToast.show("Error en exportación: " + error.message);
            //     } finally {
            //         sap.ui.core.BusyIndicator.hide();
            //     }

            //     // ============================================================
            //     // =============== Helpers Internos ============================
            //     // ============================================================

            //     async function fetchAllData(oModel, sEntitySet, aFilters) {
            //         const pageSize = 10000;
            //         let skip = 0;
            //         let allResults = [];
            //         let keepLoading = true;

            //         while (keepLoading) {
            //             const oParams = {
            //                 $skip: skip,
            //                 $top: pageSize
            //             };

            //             const chunk = await new Promise((resolve, reject) => {
            //                 oModel.read(sEntitySet, {
            //                     filters: aFilters,
            //                     urlParameters: oParams,
            //                     success: oData => resolve(oData.results || []),
            //                     error: reject
            //                 });
            //             });

            //             allResults = allResults.concat(chunk);

            //             if (chunk.length < pageSize) {
            //                 keepLoading = false;      // Última página
            //             } else {
            //                 skip += pageSize;         // Siguiente batch
            //             }
            //         }

            //         return allResults;
            //     }

            //     function parseToDate(raw) {
            //         if (raw == null || raw === "") return null;
            //         if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;

            //         const s = String(raw).trim();
            //         let m = /\/Date\((\d+)(?:[+-]\d+)?\)\//.exec(s);
            //         if (m) return new Date(parseInt(m[1], 10));

            //         if (/^\d{8}$/.test(s)) {
            //             const year = parseInt(s.slice(0, 4), 10);
            //             const month = parseInt(s.slice(4, 6), 10) - 1;
            //             const day = parseInt(s.slice(6, 8), 10);

            //             // parse date para respetar la fecha de la tabla
            //             const d = new Date(Date.UTC(year, month, day))
            //             return isNaN(d.getTime()) ? null : d;
            //         }

            //         m = /^(\d{4})[-\/](\d{2})[-\/](\d{2})/.exec(s);
            //         if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));

            //         const d2 = new Date(s);
            //         return isNaN(d2.getTime()) ? null : d2;
            //     }

            //     function parseTime(vMs) {
            //         if (vMs == null || vMs === "") return "";
            //         let ms = typeof vMs === "object" ? vMs.ms : vMs;

            //         if (typeof ms === "string" && ms.startsWith("PT")) {
            //             const regex = /PT(\d+)H(\d+)M(\d+)S/;
            //             const match = regex.exec(ms);
            //             if (match) {
            //                 const [_, h, m, s] = match;
            //                 return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:${s.padStart(2, "0")}`;
            //             }
            //         }

            //         if (isNaN(ms)) return vMs;

            //         let totalSeconds = Math.floor(ms / 1000);
            //         let hours = Math.floor(totalSeconds / 3600);
            //         let minutes = Math.floor((totalSeconds % 3600) / 60);
            //         let seconds = totalSeconds % 60;

            //         return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
            //     }

            //     function parseInputsData(index, inputKey) {
            //         const oSmartTable = that.byId("smartTable");
            //         const oInnerTable = oSmartTable.getTable();

            //         const rows = oInnerTable.getItems();
            //         const currentRow = rows[index];
            //         const currentInputValue = currentRow.getCells().filter(cell => cell.getId().includes(inputKey))[0].getValue();

            //         return currentInputValue;
            //     }
            // },


            onSmartTableExportPress: async function () {
                const that = this;

                try {
                    const oSmartTable = this.byId("smartTable");
                    const oInnerTable = oSmartTable.getTable();
                    const oModel = oInnerTable.getModel();
                    const oBinding = oInnerTable.getBinding("rows") || oInnerTable.getBinding("items");

                    if (!oBinding) {
                        sap.m.MessageToast.show("No hay datos disponibles para exportar.");
                        return;
                    }

                    sap.ui.core.BusyIndicator.show(0);

                    // =====================================================
                    // 1️⃣ FORZAR CARGA COMPLETA DEL BINDING
                    // =====================================================
                    await loadAllContexts(oBinding);

                    // =====================================================
                    // 2️⃣ OBTENER TODOS LOS CONTEXTS (YA CARGADOS)
                    // =====================================================
                    const iLength = oBinding.getLength();
                    const aContexts = oBinding.getContexts(0, iLength).filter(Boolean);

                    const aExportDataRaw = aContexts.map(ctx => ctx.getObject());

                    // =====================================================
                    // 3️⃣ APLICAR FORMATTERS / TRANSFORMACIONES
                    // =====================================================
                    // const aExportData = aExportDataRaw.map(oObj => ({
                    //     ...oObj,
                    //     NotificationCreationDate: parseToDate(oObj.NotificationCreationDate),
                    //     NotificationCreationTime: parseTime(oObj.NotificationCreationTime),
                    //     Time: parseTime(oObj.Time)
                    // }));

                    const sEntityPath = oBinding.getPath(); // ej: "/ScrapMovements"
                    const aExportData = aExportDataRaw.map(oObj => {

                        // const { ProductionOrder, ProductionOperation, Material, ReserveNumber, SerialNumber, Component, Charg, WorkCenter, Plant, StorageLocation, NotificationNumber, ItemNumber } = oObj

                        // 1️⃣ construir path lógico estable
                        const sKeyPath = oModel.createKey(sEntityPath, { ...oObj });

                        const sFullPath = `${sKeyPath}`;

                        // 2️⃣ aplicar overrides si existen
                        const oOverrides = this._mMassChanges[sFullPath] || {};

                        const oMerged = {
                            ...oObj,
                            ...oOverrides
                        };

                        // 3️⃣ aplicar formatters
                        return {
                            ...oMerged,
                            NotificationCreationDate: parseToDate(oMerged.NotificationCreationDate),
                            NotificationCreationTime: parseTime(oMerged.NotificationCreationTime),
                            Time: parseTime(oMerged.Time)
                        };
                    });

                    // =====================================================
                    // 4️⃣ COLUMNAS SEGÚN TABLA
                    // =====================================================
                    const aColumns = this.getColumnsFromTable(oInnerTable);

                    // =====================================================
                    // 5️⃣ EXPORT
                    // =====================================================
                    const oExportSettings = {
                        workbook: { columns: aColumns },
                        dataSource: aExportData,
                        fileName: "Export_ScrapMovements.xlsx"
                    };

                    const oSheet = new sap.ui.export.Spreadsheet(oExportSettings);
                    await oSheet.build();
                    oSheet.destroy();

                } catch (error) {
                    console.error("Error en exportación:", error);
                    sap.m.MessageToast.show("Error en exportación: " + error.message);
                } finally {
                    sap.ui.core.BusyIndicator.hide();
                }

                // =====================================================
                // =============== HELPERS ===============================
                // =====================================================

                async function loadAllContexts(oBinding) {

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
                }

                function parseToDate(raw) {
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
                }

                function parseTime(vMs) {
                    if (!vMs) return "";

                    let ms = typeof vMs === "object" ? vMs.ms : vMs;

                    if (typeof ms === "string" && ms.startsWith("PT")) {
                        const r = /PT(\d+)H(\d+)M(\d+)S/.exec(ms);
                        if (r) return `${r[1].padStart(2, "0")}:${r[2].padStart(2, "0")}:${r[3].padStart(2, "0")}`;
                    }

                    if (isNaN(ms)) return vMs;

                    const sec = Math.floor(ms / 1000);
                    return [
                        Math.floor(sec / 3600),
                        Math.floor((sec % 3600) / 60),
                        sec % 60
                    ].map(v => String(v).padStart(2, "0")).join(":");
                }
            }

        });
    });
