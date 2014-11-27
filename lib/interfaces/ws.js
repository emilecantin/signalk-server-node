/*
 * Copyright 2014-2015 Fabian Tollenaar <fabian@starting-point.nl>
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

(function() {
  'use strict';

  var app     = this.app
    , _       = require('lodash')
    , debug   = require('debug')('signalk-server:interfaces:ws')
    , Primus  = require('primus')
    , primus  = new Primus(app.server, { 
      transformer: 'websockets',
      pathname: '/signalk/stream' })
  ;

  
  debug('Starting Primus/WS interface');

  primus.on('connection', function(spark) {
    debug(spark.id + " connected with params " + JSON.stringify(spark.query));

    var onChange;
    var event;
    if (spark.query.stream === 'delta') {
      var context = spark.query.context;
      event = 'change:delta';
      onChange = context ?
        function(data) {
          if (data.context === context ||
            (context === 'self' && data.context === 'vessels.' + app.self.id)) {
            spark.write(data);
          }
        }
        :
        function(data) {
          console.log(data)
          spark.write(data);
        };
    } else if (spark.query.stream === 'subscribe') {
      debug('stream:subscribe');
      spark.paths = [];
      event = 'change:delta';
      onChange = function (delta) {
        var doSend = delta.updates.some(function (update) {
          return update.values.some(function (value) {
            return spark.paths.some(function (path) {
              return path === value.path;
            });
          });
        });
        if (doSend) {
          spark.write(delta);
        }
      };
      spark.on('data', function (msg) {
        debug("<" + JSON.stringify(msg));
        if (msg.command === 'subscribe') {
          spark.paths = spark.paths.concat(msg.paths);
        }
      });
    } else {
      event = 'change';
      onChange = function(data) {
        spark.write(app.signalk.retrieve());
      };
      spark.write(app.signalk.retrieve());//output tree after connect
    }

    app.signalk.on(event, onChange);

    spark.onDisconnect = function() {
      app.signalk.removeListener(event, onChange);
    }

  });

  primus.on('disconnection', function(spark) {
    spark.onDisconnect();
    debug(spark.id + " disconnected");
  });

}).call(global);