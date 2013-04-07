default: ubuntu-install

ubuntu-install:
	sudo wget -O/etc/apt/sources.list.d/couchbase.list http://packages.couchbase.com/ubuntu/couchbase-ubuntu1204.list
	wget -O- http://packages.couchbase.com/ubuntu/couchbase.key | sudo apt-key add -
	sudo apt-get update -qq
	sudo apt-get install -qq libcouchbase2 libcouchbase-dev
	wget http://packages.couchbase.com/releases/2.0.0/couchbase-server-community_x86_64_2.0.0.deb
	sudo dpkg -i couchbase-server-community_x86_64_2.0.0.deb
	

.PHONY: ubuntu-install
