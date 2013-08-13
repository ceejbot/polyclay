function dataLength(data)
{
	if (!data)
		return 0;
	if (Buffer.isBuffer(data))
		return data.length;
	return Buffer.byteLength(data);
}

exports.dataLength = dataLength;

function nodeify(promise, callback)
{
	if (typeof callback !== 'function')
		return promise;

	promise
	.then(function(value)
	{
		callback(null, value);
	}, callback)
	.done();
}

exports.nodeify = nodeify;
