sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "zdomscrapmovements/utils/FioriComponent"
], function (JSONModel, FioriComponent) {
    "use strict";

    return {
        getModel: function () {
            //gets component
            var component = FioriComponent.getComponent();
            //gets model
            var jsonModel = component.byId("App").getModel("AppJsonModel");
            //checks if the model exists
            if (!jsonModel) {
                jsonModel = new JSONModel();
                component.byId("App").setModel(jsonModel, "AppJsonModel");
            }
            return jsonModel;
        },

        initializeModel: function () {
            var jsonModel = this.getModel();
            jsonModel.setData({
                "FilterValues": {
                    "ProductionOrder": "",
                    "ProductOrderOperation": "",
                    "SerialNumber": "",
                    "Material": "",
                    "WorkCenter": "",
                    "Plant": "",
                    "StorageLocation": "",
                    "Zuser": "",
                    "Equipment": "",
                    "ReferenceNumber": "",
                },
                "Plant": [{
                    "label": "{i18n>plant}",
                    "template": "Plant"
                }, {
                    "label": "{i18n>name}",
                    "template": "Name"
                }
                ],
                "WorkCenter": [{

                    "label": "{i18n>workcenter}",
                    "template": "WorkCenter"
                },
                {
                    "label": "{i18n>plant}",
                    "template": "Plant"
                },
                {
                    "label": "{i18n>description}",
                    "template": "Description"
                },
                ],
                "ProductionOrder": [
                    {
                        "label": "{i18n>productionOrder}",
                        "template": "ProductionOrder"
                    },
                    {
                        "label": "{i18n>material}",
                        "template": "Material"
                    },
                    {
                        "label": "{i18n>materialDescription}",
                        "template": "MaterialDescription"
                    },
                    {
                        "label": "{i18n>orderType}",
                        "template": "OrderType"
                    },
                ],
                "ProductOrderOperation": [
                    {
                        "label": "{i18n>productionOrderOp}",
                        "template": "ProductionOperation"
                    },
                    {
                        "label": "{i18n>plant}",
                        "template": "Plant"
                    },
                    {
                        "label": "{i18n>workcenter}",
                        "template": "WorkCenter"
                    },
                ],
                "Zuser": [{
                    "label": "{i18n>zuser}",
                    "template": "Zuser"
                }],
                "SerialNumber": [{
                    "label": "{i18n>serialNumber}",
                    "template": "SerialNumber"
                }, {
                    "label": "{i18n>productionOrder}",
                    "template": "ProductionOrder"
                }],
                "StorageLocation": [
                    {
                        "label": "{i18n>storageLocation}",
                        "template": "StorageLocation"
                    },
                ],
                "ReferenceNumber": [
                    {
                        "label": "{i18n>referenceNumber}",
                        "template": "ReferenceNumber"
                    },
                ],
                "Equipment": [
                    {
                        "label": "{i18n>equipment}",
                        "template": "Equipment"
                    },
                    {
                        "label": "{i18n>description}",
                        "template": "Description"
                    },
                    {
                        "label": "{i18n>dniEquipment}",
                        "template": "DNIEquipment"
                    },
                ],
                "Material": [
                    {
                        "label": "{i18n>material}",
                        "template": "MaterialNumber"
                    },
                    {
                        "label": "{i18n>description}",
                        "template": "Description"
                    },
                ],
                "CostCenter": [
                    {
                        "label": "{i18n>costcenter}",
                        "template": "costcenter"
                    },
                    {
                        "label": "{i18n>plant}",
                        "template": "plant"
                    },
                    {
                        "label": "{i18n>workcenter}",
                        "template": "workcenter"
                    },
                ],
                "CostCenterOld": [
                    {
                        "label": "{i18n>costcenter}",
                        "template": "CostCenter"
                    },
                    {
                        "label": "{i18n>controllingArea}",
                        "template": "ControllingArea"
                    },
                    {
                        "label": "{i18n>name}",
                        "template": "Name"
                    },
                ],
                "Reason": [{
                    "label": "{i18n>reason}",
                    "template": "Reason"
                },
                {
                    "label": "{i18n>description}",
                    "template": "Description"
                }
                ],
                "ReasonInput": "",
                "CostCenterInput": "",
                "ReferenceNumbers": [],
                "TableData": [{}],
                "Descripcion": {},
                "Enabled": {
                    "Material": true,
                    "SaveBtn": false,
                    "CostCenter": true,
                    "Reason": true,
                    "ValueState": "None",
                    "guardar": ""
                },
                "Visible": {
                    "ReferenceNumberVisible": false,
                }
                // "EditFragment": {
                //     "visibleAufnr": true,
                //     "visibleKostl": true
                // },
            });
            return jsonModel;
        },

        setProperty: function (sPropery, value) {
            this.getModel().setProperty(sPropery, value);
            this.updateModel();
        },

        setInnerProperty: function (sProperty, innerProp, value) {
            let mainProp = this.getProperty(sProperty);

            mainProp[innerProp] = value;
            this.updateModel();
        },

        getProperty: function (sPropery) {
            return this.getModel().getProperty(sPropery);
        },

        updateModel: function () {
            this.getModel().updateBindings(true);
        }

    };
});