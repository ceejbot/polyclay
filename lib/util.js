function dataLength(data)
{
	if (!data)
		return 0;
	if (Buffer.isBuffer(data))
		return data.length;
	return Buffer.byteLength(data);
}

exports.dataLength = dataLength;
