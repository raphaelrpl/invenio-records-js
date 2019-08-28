/*
 * This file is part of Invenio.
 * Copyright (C) 2016 CERN.
 *
 * Invenio is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2 of the
 * License, or (at your option) any later version.
 *
 * Invenio is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Invenio; if not, write to the Free Software Foundation, Inc.,
 * 59 Temple Place, Suite 330, Boston, MA 02111-1307, USA.
 *
 * In applying this license, CERN does not
 * waive the privileges and immunities granted to it by virtue of its status
 * as an Intergovernmental Organization or submit itself to any jurisdiction.
 */

angular.module('invenioRecords.config', []);
angular.module('invenioRecords.controllers', []);
angular.module('invenioRecords.directives', []);
angular.module('invenioRecords.factories', []);
angular.module('invenioRecords.services', []);

angular.module('invenioRecords', [
  'schemaForm',
  'invenioRecords.config',
  'invenioRecords.factories',
  'invenioRecords.services',
  'invenioRecords.controllers',
  'invenioRecords.directives',
]);


function InvenioRecordsCtrl($scope, $rootScope, $q, $window, $location,
    $timeout, InvenioRecordsAPI, ChainedPromise) {


  var vm = this;

  vm.invenioRecordsArgs = {
    url: '/',
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  vm.invenioRecordsModel = null;
  vm.invenioRecordsEndpoints = null;

  vm.invenioRecordsLoading = true;

  vm.invenioRecordsAlert = null;



  function invenioRecordsSetSchema(response) {
    vm.invenioRecordsSchema = response.data;
  }

  function invenioRecordsSetForm(response) {
    vm.invenioRecordsForm = response.data;
  }

  function invenioRecordsInit(evt, args, endpoints, record, links) {
    $rootScope.$broadcast('invenio.records.loading.start');
    vm.invenioRecordsModel = angular.copy(record);
    vm.invenioRecordsEndpoints = angular.merge(
      {},
      endpoints
    );

    vm.invenioRecordsArgs = angular.merge(
      {},
      vm.invenioRecordsArgs,
      args
    );

    if (Object.keys(links).length > 0) {
      $rootScope.$broadcast(
        'invenio.records.endpoints.updated', links
      );
    }

    $q.all([
      InvenioRecordsAPI.get(vm.invenioRecordsEndpoints.schema)
        .then(invenioRecordsSetSchema),
      InvenioRecordsAPI.get(vm.invenioRecordsEndpoints.form)
        .then(invenioRecordsSetForm)
    ]).then(function() {
      $rootScope.$broadcast('invenio.records.loading.stop');
    });
  }

  function getEndpoints(){
    var deferred = $q.defer();
    if (angular.isUndefined(vm.invenioRecordsEndpoints.self)) {
      var request = InvenioRecordsAPI.prepareRequest(
        vm.invenioRecordsEndpoints.initialization,
        'POST',
        {},
        vm.invenioRecordsArgs,
        vm.invenioRecordsEndpoints
      );
      InvenioRecordsAPI.request(request)
        .then(function success(response) {
        $rootScope.$broadcast(
          'invenio.records.endpoints.updated', response.data.links
        );
        deferred.resolve({});
      }, function error(response) {
        deferred.reject(response);
      });
    } else {
      deferred.resolve({});
    }
    return deferred.promise;
  }

  function wrapAction(type, method) {
    function _doAction() {
      return makeActionRequest(type, method);
    }
    return _doAction;
  }

  function makeActionRequest(type, method) {
    var request = InvenioRecordsAPI.prepareRequest(
      vm.invenioRecordsEndpoints[type],
      method,
      vm.invenioRecordsModel,
      vm.invenioRecordsArgs,
      vm.invenioRecordsEndpoints
    );
    return InvenioRecordsAPI.request(request);
  }

  function handleActionRedirection(redirect_path) {
    if (!angular.isUndefined(redirect_path) && redirect_path !== '') {
      var _url = redirect_path;
      if (redirect_path.substr(0, 1) !== '/' && redirect_path.substr(0, 4) !== 'http') {
        _url = vm.invenioRecordsEndpoints[redirect_path];
      }
      $window.location.href = _url;
    }
  }

  function invenioRecordsHandler(actions, redirect_path) {

    var _actions = (typeof(actions[0]) === 'string') ? [actions] : actions;
    function actionSuccessful(responses) {
      var response = responses[responses.length - 1] || responses;

      $rootScope.$broadcast('invenio.records.alert', {
        type: 'success',
        data: response.data,
        action: _actions
      });
      if (!angular.isUndefined(response.data.links)){
        $rootScope.$broadcast(
          'invenio.records.endpoints.updated', response.data.links
        );
      }

      $rootScope.$broadcast('invenio.records.action.success', _actions);

      $rootScope.$broadcast('invenio.records.loading.stop');

      handleActionRedirection(redirect_path || undefined);
    }
    function actionErrored(responses) {
      var response = responses[responses.length - 1] || responses;
      $rootScope.$broadcast('invenio.records.alert', {
        type: 'danger',
        data: response.data,
      });

      if (response.data.status === 400 && response.data.errors) {
        var deferred = $q.defer();
        var promise = deferred.promise;
        promise.then(function displayValidationErrors() {
          angular.forEach(response.data.errors, function(value) {
            $scope.$broadcast(
              'schemaForm.error.' + value.field,
              'backendValidationError',
              value.message
            );
          });
        }).then(function stopLoading() {
          $rootScope.$broadcast('invenio.records.loading.stop');
        });
        deferred.resolve();
      } else {
        $rootScope.$broadcast('invenio.records.loading.stop');
      }
      $rootScope.$broadcast('invenio.records.action.error', response.data);
    }

    $rootScope.$broadcast('invenio.records.loading.start');

    getEndpoints().then(
      function() {
        var promises = [];
        angular.forEach(_actions, function(action, index) {
          this.push(
            wrapAction(action[0], action[1])
          );
        }, promises);
        ChainedPromise.promise(promises).then(
          actionSuccessful,
          actionErrored
        );
      },
      actionErrored
    );
  }

  function invenioRecordsRemoveValidation(fieldValue, form) {
    if (form.validationMessage) {
      $scope.$broadcast(
        'schemaForm.error.' + form.key.join('.'),
        'backendValidationError',
        true
      );
    }
  }

  function invenioRecordsLoadingStart(evt) {
    vm.invenioRecordsLoading = true;
  }

  function invenioRecordsLoadingStop(evt) {
    vm.invenioRecordsLoading = false;
  }

  function invenioRecordsAlert(evt, data) {
    vm.invenioRecordsAlert = null;
    $timeout(function() {
      vm.invenioRecordsAlert = data;
    }, 0);
  }

  function invenioRecordsActionSuccess(evt, types) {
    var _types = [];
    angular.forEach(types, function(item, index) {
      this.push(item[0]);
    }, _types);
    if (_types.indexOf('self') > -1) {
      $scope.depositionForm.$setPristine();
    } else if (_types.indexOf('publish') > -1) {
      $scope.depositionForm.$setPristine();
      $scope.depositionForm.$setSubmitted();
    }
  }

  function invenioRecordsEndpointsUpdated(evt, endpoints) {
    vm.invenioRecordsEndpoints = angular.merge(
      {},
      vm.invenioRecordsEndpoints,
      endpoints
    );
    $rootScope.$broadcast(
      'invenio.records.location.updated', endpoints
    );
  }

  function invenioRecordsLocationUpdated(evt, endpoints) {
    if (!angular.isUndefined(endpoints.html)) {
      var _current = document.createElement('a');
      _current.href = $location.path();
      var _endpoints = document.createElement('a');
      _endpoints.href = endpoints.html;
      if (_endpoints.pathname !== _current.pathname) {
        $location.url(_endpoints.pathname);
        $location.replace();
      }
    }
  }


  vm.actionHandler = invenioRecordsHandler;
  vm.removeValidationMessage = invenioRecordsRemoveValidation;




  $scope.$on('invenio.records.init', invenioRecordsInit);


  $rootScope.$on('invenio.records.alert', invenioRecordsAlert);

  $rootScope.$on('invenio.records.loading.start', invenioRecordsLoadingStart);
  $rootScope.$on('invenio.records.loading.stop', invenioRecordsLoadingStop);

  $rootScope.$on(
    'invenio.records.action.success', invenioRecordsActionSuccess
  );

  $rootScope.$on(
    'invenio.records.endpoints.updated', invenioRecordsEndpointsUpdated
  );

  $rootScope.$on(
    'invenio.records.location.updated', invenioRecordsLocationUpdated
  );
}

InvenioRecordsCtrl.$inject = [
  '$scope',
  '$rootScope',
  '$q',
  '$window',
  '$location',
  '$timeout',
  'InvenioRecordsAPI',
  'ChainedPromise',
];

angular.module('invenioRecords.controllers')
  .controller('InvenioRecordsCtrl', InvenioRecordsCtrl);

function invenioRecordsConfiguration($locationProvider) {
  $locationProvider.html5Mode({
    enabled: true,
    requireBase: false,
    rewriteLinks: false,
  });
}

invenioRecordsConfiguration.$inject = ['$locationProvider'];

angular.module('invenioRecords.config')
  .config(invenioRecordsConfiguration);


function invenioRecords() {


  function link(scope, element, attrs, vm) {
    var templateParams = {
      templateParams: JSON.parse(attrs.templateParams || '{}')
    };

    var extraParams = JSON.parse(attrs.extraParams || '{}');

    var links = JSON.parse(attrs.links || '{}');

    var args = angular.merge(
      {},
      templateParams,
      extraParams
    );

    var endpoints = {
      form: attrs.form,
      initialization: attrs.initialization,
      schema: attrs.schema,
    };
    var record = JSON.parse(attrs.record || '{}');
    scope.$broadcast(
      'invenio.records.init', args, endpoints, record, links
    );
  }


  return {
    restrict: 'AE',
    scope: false,
    controller: 'InvenioRecordsCtrl',
    controllerAs: 'recordsVM',
    link: link,
  };
}

angular.module('invenioRecords.directives')
  .directive('invenioRecords', invenioRecords);


function invenioRecordsActions() {


  function templateUrl(element, attrs) {
    return attrs.template;
  }


  return {
    restrict: 'AE',
    scope: false,
    require: '^invenioRecords',
    templateUrl: templateUrl,
  };
}

angular.module('invenioRecords.directives')
  .directive('invenioRecordsActions', invenioRecordsActions);


function invenioRecordsAlert() {


  function templateUrl(element, attrs) {
    return attrs.template;
  }


  return {
    restrict: 'AE',
    scope: false,
    require: '^invenioRecords',
    templateUrl: templateUrl,
  };
}

angular.module('invenioRecords.directives')
  .directive('invenioRecordsAlert', invenioRecordsAlert);


function invenioRecordsForm($q, schemaFormDecorators, InvenioRecordsAPI,
  $httpParamSerializerJQLike) {


  function link(scope, element, attrs, vm) {

    if (attrs.formTemplates && attrs.formTemplatesBase) {
      var formTemplates = JSON.parse(attrs.formTemplates);
      var formTemplatesBase = attrs.formTemplatesBase;

      if (formTemplatesBase.substr(formTemplatesBase.length -1) !== '/') {
        formTemplatesBase = formTemplatesBase + '/';
      }

      angular.forEach(formTemplates, function(value, key) {
        schemaFormDecorators
          .decorator()[key.replace('_', '-')]
          .template = formTemplatesBase + value;
      });
    }

    var getProp = function (obj, prop) {
      return prop.split('.').reduce(function(data, item) {
        return data[item];
      }, obj);
    };

    function _errorOrEmpty(){
      var defer = $q.defer();
      defer.resolve({data: []});
      return defer.promise;
    }

    function _suggestEngine(args, map) {
      if (args.url !== undefined) {
        return InvenioRecordsAPI.request(args)
          .then(
            function success(response) {
              var data = getProp(response.data, map.resultSource);
              angular.forEach(data, function(value, key) {
                var item = {};
                item[map.valueProperty] = getProp(value, map.valueSource || map.valueProperty);
                item[map.nameProperty] = getProp(value, map.nameSource || map.nameProperty);
                data[key] = item;
              });
              return {
                data: data
              };
            },
            _errorOrEmpty
          );
      }
      return _errorOrEmpty();
    }

    function _urlParser(url, urlParameters, query){
      if (urlParameters !== undefined) {
        var urlArgs = {};
        angular.forEach(urlParameters, function(value, key) {
          try {
            if (value === 'value'){
              urlArgs[key] = query;
            } else {
              urlArgs[key] = scope.$eval(value) || value;
            }
          } catch(error) {
            urlArgs[key] = value;
          }
        });
        url = url + '?' + $httpParamSerializerJQLike(
          angular.merge({}, urlArgs)
        );
      }
      return url;
    }

    function autocompleteSuggest(options, query) {
      var args = {};
      if (query === '') {
        if (scope.lastSuggestions[options.url]) {
          var defer = $q.defer();
          defer.resolve(scope.lastSuggestions[options.url]);
          return defer.promise;
        } else if (options.scope && typeof options.scope.insideModel === 'string') {
          query = options.scope.insideModel;
          query = scope.$eval(options.processQuery || 'query', {query: query});
        }
      }
      if (query && options.url !== undefined) {
        args = angular.extend({}, args,
          {
            url: _urlParser(options.url, options.urlParameters, query),
            method: 'GET',
            data: options.data || {},
            headers: options.headers || vm.invenioRecordsArgs.headers
          }
        );
      }
      return _suggestEngine(args, options.map).then(function(response) {
        scope.lastSuggestions[options.url] = response;
        return response;
      });
    }
    scope.lastSuggestions = {};
    scope.autocompleteSuggest = autocompleteSuggest;
  }

  function templateUrl(element, attrs) {
    return attrs.template;
  }


  return {
    restrict: 'AE',
    link: link,
    scope: false,
    require: '^invenioRecords',
    templateUrl: templateUrl,
  };
}

invenioRecordsForm.$inject = [
  '$q',
  'schemaFormDecorators',
  'InvenioRecordsAPI',
  '$httpParamSerializerJQLike'
];

angular.module('invenioRecords.directives')
  .directive('invenioRecordsForm', invenioRecordsForm);


function invenioRecordsLoading() {


  function templateUrl(element, attrs) {
    return attrs.template;
  }


  return {
    restrict: 'AE',
    scope: false,
    require: '^invenioRecords',
    templateUrl: templateUrl,
  };
}

angular.module('invenioRecords.directives')
  .directive('invenioRecordsLoading', invenioRecordsLoading);


function ChainedPromise($q) {

  var chained = {};
  chained.promise = function(promises) {
    var defer = $q.defer();
    var data = [];

    function _chain(fn) {
      fn().then(
        function(_data) {
          data.push(_data);
          if (promises.length > 0) {
            return _chain(promises.shift());
          } else {
            defer.resolve(data);
          }
        }, function(error) {
          defer.reject(error);
        }
      );
    }
    _chain(promises.shift());
    return defer.promise;
  };

  return chained;
}

ChainedPromise.$inject = [
  '$q',
];

angular.module('invenioRecords.factories')
  .factory('ChainedPromise', ChainedPromise);


function InvenioRecordsAPI($http, $q) {

  function request(args) {
    return $http(args);
  }

  function get(url) {
    if (url === null) {
      var deferred = $q.defer();
      deferred.resolve();
      return deferred.promise;
    }
    var args = {
      url: url,
      method: 'GET'
    };
    return request(args);
  }

  function cleanData(data, unwanted) {
    var _unwantend = unwanted || [[null], [{}], '', [undefined]];
    angular.forEach(data, function(value, key) {
      angular.forEach(_unwantend, function(_value) {
        if (angular.equals(_value, value))  {
          delete data[key];
        }
      });
    });
    return data;
  }

  function getData(model, extraParams, endpoints) {
    var data = angular.merge(
      {},
      extraParams.data || {},
      cleanData(model)
    );
    if (data.$schema === undefined && endpoints.schema !== undefined) {
      data.$schema = endpoints.schema;
    }
    return data;
  }

  function prepareRequest(url, method, model, extraParams, endpoints) {
    var requestObject = {
      url: url,
      method: method,
      headers: extraParams.headers || {},
      data: getData(model, extraParams, endpoints)
    };
    return requestObject;
  }

  return {
    cleanData: cleanData,
    get: get,
    getData: getData,
    prepareRequest: prepareRequest,
    request: request,
  };
}

InvenioRecordsAPI.$inject = ['$http', '$q'];

angular.module('invenioRecords.services')
  .service('InvenioRecordsAPI', InvenioRecordsAPI);
