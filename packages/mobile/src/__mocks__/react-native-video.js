'use strict';
const React = require('react');
const Video = ({ children, ...props }) => React.createElement('Video', props, children);
Video.displayName = 'Video';
module.exports = Video;
module.exports.default = Video;
