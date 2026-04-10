'use strict';
const React = require('react');
const Icon = ({ name, ...rest }) => React.createElement('Icon', { name, ...rest });
module.exports = { Ionicons: Icon, MaterialIcons: Icon, FontAwesome: Icon, FontAwesome5: Icon, Feather: Icon };
