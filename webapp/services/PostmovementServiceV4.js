sap.ui.define([
	"sap/ui/model/odata/v4/ODataModel"
], function (ODataModel) {
	"use strict";
	return {
		_oModel: null,
		getOdataModel: function () {
			if (this._oModel) {
				return this._oModel;
			}
			//builds model
			this._oModel = new ODataModel({
				serviceUrl: "/sap/opu/odata4/sap/zsb_dom_w_0015_api_v4/srvd/sap/zsb_zdom_w_0015_v4/0001/", // Debe terminar en "/"
				synchronizationMode: "None",
				operationMode: "Server",
				groupId: "$direct" // equivalente a "useBatch: false" de V2
			});

			return this._oModel;
		},

		callGetService: function (sEntity, aFilter = []) {
			var oBinding = this.getOdataModel().bindList("/" + sEntity, undefined, undefined, aFilter);
			return oBinding.requestContexts().then(function (aContexts) {
				return aContexts.map(function (oCtx) { return oCtx.getObject(); });
			});
		},

		callGetServiceExpand: function (sEntity, mParams = {}) {
			var oBinding = this.getOdataModel().bindList("/" + sEntity, undefined, undefined, undefined, mParams);
			return oBinding.requestContexts().then(function (aContexts) {
				return aContexts.map(function (oCtx) { return oCtx.getObject(); });
			});
		},

		callPostService: function (sEntity, oPayload) {
			var oListBinding = this.getOdataModel().bindList("/" + sEntity);
			var oContext = oListBinding.create(oPayload);
			return oContext.created().then(function () {
				return oContext.getObject();
			});
		},

		callDeleteService: function (oContext) {
			// en V4 el remove se hace sobre el contexto, no sobre la entidad como string
			return oContext.delete();
		},

		callActionService: function (sActionName, oParams) {
			let oModel = this.getOdataModel();
			let sNamespace = "com.sap.gateway.srvd.zsb_zdom_w_0015_v4.v0001";
			let oOperation = oModel.bindContext(
				"/PostMovement/" + sNamespace + "." + sActionName + "(...)"
			);

			Object.keys(oParams).forEach(function (sKey) {
				oOperation.setParameter(sKey, oParams[sKey]);
			});

			const oMessageManager = sap.ui.getCore().getMessageManager();
			const oMessageModel = oMessageManager.getMessageModel();

			// Marca cuántos mensajes había ANTES de ejecutar, para filtrar solo los nuevos
			const iCountBefore = oMessageModel.getData().length;

			return oOperation.execute().then(function () {
				const aAllMessages = oMessageModel.getData();
				const aNewMessages = aAllMessages.slice(iCountBefore);

				return {
					data: oOperation.getBoundContext().getObject(),
					messages: aNewMessages
				};
			});
		},

		postData: function (sActionName, oPayload) {
			return this.callActionService(sActionName, oPayload);
		},

		getData: function (sEntity) {
			return this.callGetService(sEntity);
		}

	};
});