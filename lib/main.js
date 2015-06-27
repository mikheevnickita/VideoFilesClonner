const {Cc,Ci,Cr} = require("chrome");
const fileIO = require("sdk/io/file");

var { ToggleButton } = require("sdk/ui/button/toggle");
var tabs   = require("sdk/tabs");
var simplePrefs = require("sdk/simple-prefs");

var observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
		
var button = ToggleButton({
	id: "test_button",
	label: "this should show on hover",
	icon: {
		"32": "./icon32.png"
	},
	onChange: onButtonClick,
	badgecolor: "#5CC5FF"
});

function onButtonClick(state) {
	if (state.checked)
	{
		observerService.addObserver(httpRequestObserver, "http-on-examine-response", false);
		button.badge = 0;
	} else {
		observerService.removeObserver(httpRequestObserver, "http-on-examine-response");
		button.badge = "";
	}
}

var httpRequestObserver =
{
    observe: function(aSubject, aTopic, aData)
    {
        if (aTopic == "http-on-examine-response")
        {
			var channel = aSubject.QueryInterface(Ci.nsIHttpChannel);
			if (channel != null){

				if (channel.contentType == simplePrefs.prefs["contentTypePref"]) {

					var newListener = new TracingListener();
					aSubject.QueryInterface(Ci.nsITraceableChannel);
					newListener.originalListener = aSubject.setNewListener(newListener);
					
					button.badge += 1;
				}
			}
		}
    },

    QueryInterface : function (aIID)
    {
        if (aIID.equals(Ci.nsIObserver) ||
            aIID.equals(Ci.nsISupports))
        {
            return this;
        }

        throw Cr.NS_NOINTERFACE;
    }
};

function makeURI(aURL) {
  return Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService).newURI(aURL, null, null);
}
function CCIN(cName, ifaceName) {
    return Cc[cName].createInstance(Ci[ifaceName]);
}
function clearStr(string)
{
	var indx = string.indexOf("?");
	if (indx > 0)
		return string.substring(0, indx)
	else 
		return string;
}

function TracingListener() {
    this.originalListener = null;
    this.receivedData = []; 
	var wrsteream = null;
}

TracingListener.prototype =
{
    onDataAvailable: function(request, context, inputStream, offset, count)
    {
        var binaryInputStream = CCIN("@mozilla.org/binaryinputstream;1",
                "nsIBinaryInputStream");
        var storageStream = CCIN("@mozilla.org/storagestream;1", "nsIStorageStream");
        var binaryOutputStream = CCIN("@mozilla.org/binaryoutputstream;1",
                "nsIBinaryOutputStream");

        binaryInputStream.setInputStream(inputStream);
        storageStream.init(8192, count, null);
        binaryOutputStream.setOutputStream(storageStream.getOutputStream(0));

        var data = binaryInputStream.readBytes(count);
        this.receivedData.push(data);

        binaryOutputStream.writeBytes(data, count);
		
		if (this.wrstream != null)
			this.wrstream.write(data);
		
        this.originalListener.onDataAvailable(request, context,
            storageStream.newInputStream(0), offset, count);
    },

    onStartRequest: function(request, context) {

		var req = request.QueryInterface(Ci.nsIRequest);
		if (req != null)
		{
			var uri = makeURI(req.name);
			var path = simplePrefs.prefs["downloadPathPref"];
			if (path == "")
				path = "g:\\Downloads\\Videos";

			var fullPath = "";
			var name = "";

			var parts = uri.path.split("/");
			var len = parts.length;
			if (len >= 2)
			{
				var subPath = clearStr(parts[len-2]);
				name = clearStr(parts[len-1]);
				
				fullPath = path + "\\" + uri.host + "\\" + subPath + "\\";
				fileIO.mkpath(fullPath);
			}
			if (len == 1)
			{
				name = clearStr(parts[len-1]);
				
				fullPath = path + "\\" + uri.host + "\\";
				fileIO.mkpath(fullPath);
			}

			if (len != 0)
				this.wrstream = fileIO.open(fullPath + name, "wb");
		}
		
        this.originalListener.onStartRequest(request, context);
    },

    onStopRequest: function(request, context, statusCode)
    {
		if (this.wrstream != null)
			this.wrstream.close();
		
        var responseSource = this.receivedData.join("");
        this.originalListener.onStopRequest(request, context, statusCode);
    },

    QueryInterface: function (aIID) {
        if (aIID.equals(Ci.nsIStreamListener) ||
            aIID.equals(Ci.nsISupports)) {
            return this;
        }
        throw Cr.NS_NOINTERFACE;
    }
}
