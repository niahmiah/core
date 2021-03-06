'use strict';

// TODO: Replace (or supplement) these integration tests with unit tests
// TODO: when we have more time to do so.

var expect = require('chai').expect;
var async = require('async');
var os = require('os');
var fs = require('fs');
var path = require('path');
var storj = require('../../');
var kad = require('kad');
var ms = require('ms');
var Contract = require('../../lib/contract');
var Audit = require('../../lib/audit');
var Contact = require('../../lib/network/contact');
var utils = require('../../lib/utils');
var DataChannelClient = require('../../lib/datachannel/client');
var StorageItem = require('../../lib/storage/item');
var Verification = require('../../lib/verification');
var memdown = require('memdown');

var NODE_LIST = [];
var STARTING_PORT = 65535;

function createNode(opcodes) {
  var node = null;
  var kp = new storj.KeyPair();
  var manager = new storj.Manager(new storj.LevelDBStorageAdapter(
    os.tmpdir(), memdown
  ));
  var datadir = path.join(os.tmpdir(), kp.getNodeID());
  var port = STARTING_PORT--;

  fs.mkdirSync(datadir);

  var options = {
    keypair: kp,
    manager: manager,
    logger: kad.Logger(0),
    seeds: NODE_LIST.length ? [NODE_LIST[0]] : NODE_LIST,
    address: '127.0.0.1',
    port: port,
    opcodes: opcodes,
    noforward: true
  };

  if (opcodes.length) {
    node = storj.FarmerInterface(options);
  } else {
    node = storj.RenterInterface(options);
  }

  NODE_LIST.push([
    'storj://127.0.0.1:', port, '/', kp.getNodeID()
  ].join(''));

  return node;
}

function createRenter() {
  return createNode([]);
}

function createFarmer() {
  return createNode(['0f01010202']);
}

var data = new Buffer('ALL THE SHARDS');
var hash = storj.utils.rmd160sha256(data);

var farmers = Array.apply(null, Array(1)).map(function() {
  return createFarmer();
});
var renters = Array.apply(null, Array(2)).map(function() {
  return createRenter();
});

describe('Interfaces/Farmer+Renter/Integration', function() {

  describe('#join', function() {

    it('should connect all the nodes together', function(done) {
      this.timeout(5000);
      farmers[0].join(function() {
        farmers.shift();
        async.eachSeries(farmers.concat(renters), function(node, done) {
          node.join(done);
        }, done);
      });
    });

  });

  var renter = renters[renters.length - 1];
  var contract = null;
  var farmer = null;
  var shard = new Buffer('hello storj');
  var audit = new Audit({ audits: 12, shard: shard });
  var ctoken = null;
  var rtoken = null;

  describe('#getStorageOffer', function() {

    it('should receive an offer for the published contract', function(done) {
      this.timeout(12000);
      contract = new Contract({
        renter_id: renter._keypair.getNodeID(),
        data_size: shard.length,
        data_hash: utils.rmd160sha256(shard),
        store_begin: Date.now(),
        store_end: Date.now() + 10000,
        audit_count: 12
      });
      renter.getStorageOffer(contract, function(_farmer, _contract) {
        expect(_farmer).to.be.instanceOf(Contact);
        expect(_contract).to.be.instanceOf(Contract);
        contract = _contract;
        farmer = _farmer;
        done();
      });
    });

  });

  describe('#getConsignToken', function() {

    it('should be issued an consign token from the farmer', function(done) {
      this.timeout(6000);
      renter.getConsignToken(farmer, contract, audit, function(err, token) {
        expect(err).to.equal(null);
        expect(typeof token).to.equal('string');
        ctoken = token;
        done();
      });
    });

    after(function(done) {
      var dcx = DataChannelClient(farmer);
      dcx.on('open', function() {
        var stream = dcx.createWriteStream(ctoken, utils.rmd160sha256(shard));
        stream.on('finish', done);
        stream.write(shard);
        stream.end();
      });
    });

  });

  describe('#getRetrieveToken', function() {

    it('should be issued an retrieve token from the farmer', function(done) {
      this.timeout(6000);
      renter.getRetrieveToken(farmer, contract, function(err, token) {
        expect(err).to.equal(null);
        expect(typeof token).to.equal('string');
        rtoken = token;
        done();
      });
    });

    after(function(done) {
      var dcx = DataChannelClient(farmer);
      dcx.on('open', function() {
        var stream = dcx.createReadStream(rtoken, utils.rmd160sha256(shard));
        stream.on('end', done);
        stream.on('data', function(chunk) {
          expect(Buffer.compare(chunk, shard)).to.equal(0);
        });
      });
    });

  });

  describe('#getStorageProof', function() {

    it('should get the proof response from the farmer', function(done) {
      this.timeout(6000);
      var itemdata = {
        shard: shard,
        hash: utils.rmd160sha256(shard),
        contracts: {},
        challenges: {}
      };
      itemdata.contracts[farmer.nodeID] = contract.toObject();
      itemdata.challenges[farmer.nodeID] = audit.getPrivateRecord();
      var item = new StorageItem(itemdata);
      renter.getStorageProof(farmer, item, function(err, proof) {
        var v = Verification(proof).verify(
          audit.getPrivateRecord().root,
          audit.getPrivateRecord().depth
        );
        expect(v[0]).to.equal(v[1]);
        done();
      });
    });

  });

});

describe('Interfaces/Farmer+Renter/Integration (deprecated)', function() {

  describe('#store (deprecated)', function() {

    it('should negotiate a storage contract with a farmer', function(done) {
      this.timeout(12000);
      var renter = renters[renters.length - 1];
      var duration = ms('20s');
      renter.store(data, duration, function(err, key) {
        expect(err).to.equal(null);
        expect(key).to.equal(hash);
        done();
      });
    });

  });


  describe('#retrieve (deprecated)', function() {

    it('should fetch the file from the farmer', function(done) {
      var renter = renters[renters.length - 1];
      var buffer = Buffer([]);
      renter.retrieve(hash, function(err, result) {
        expect(err).to.equal(null);
        result.on('end', function() {
          expect(Buffer.compare(data, buffer)).to.equal(0);
          done();
        });
        result.on('data', function(data) {
          buffer = Buffer.concat([buffer, data]);
        });
      });
    });

  });


  describe('#audit (deprecated)', function() {

    it('should successfully audit the stored data', function(done) {
      var renter = renters[renters.length - 1];
      renter.audit(hash, function(err, result) {
        expect(err).to.equal(null);
        expect(result[0]).to.equal(result[1]);
        done();
      });
    });

  });

});
