function dataLength(data)
{
	if (!data)
		return 0;
	if (data instanceof Buffer)
		return data.length;
	return Buffer.byteLength(data);
}

exports.dataLength = dataLength;
