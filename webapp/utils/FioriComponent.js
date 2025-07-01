sap.ui.define([], function () {
	"use strict";
	return {
		_component: null,
		getComponent: function () {
			return this._component;
		},
		setComponent: function (component) {
			this._component = component;
		}
	};
});