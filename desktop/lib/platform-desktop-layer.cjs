"use strict";
function createDesktopLayer(options={}) {
 if((options.platform||process.platform)==='darwin')return require('./mac-desktop-layer.cjs').createMacDesktopLayer(options);
 return require('./desktop-layer.cjs').createDesktopLayer(options);
}
module.exports={createDesktopLayer};
