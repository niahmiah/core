'use strict';

var memdown = require('memdown');
var LevelDBStorageAdapter = require('../../../lib/storage/adapters/level');
var StorageItem = require('../../../lib/storage/item');
var expect = require('chai').expect;
var utils = require('../../../lib/utils');
var Contract = require('../../../lib/contract');
var Audit = require('../../../lib/audit');
var sinon = require('sinon');

function tmpdir() {
  return require('os').tmpdir() + '/test-' + Date.now() + '.db';
}

describe('LevelDBStorageAdapter', function() {

  var store = new LevelDBStorageAdapter(tmpdir(), memdown);
  var hash = utils.rmd160('test');
  var audit = new Audit({ shard: new Buffer('test'), audit: 12 });
  var contract = new Contract();
  var item = new StorageItem({
    hash: hash,
    shard: new Buffer('test')
  });

  describe('@constructor', function() {

    it('should create instance without the new keyword', function() {
      expect(
        LevelDBStorageAdapter(tmpdir(), memdown)
      ).to.be.instanceOf(LevelDBStorageAdapter);
    });

  });

  describe('#_put', function() {

    it('should store the item', function(done) {
      item.contracts[hash] = contract;
      item.challenges[hash] = audit.getPrivateRecord();
      item.trees[hash] = audit.getPublicRecord();
      store._put(hash, item, function(err) {
        expect(err).equal(null);
        done();
      });
    });

  });

  describe('#_get', function() {

    it('should return the stored item', function(done) {
      store._get(hash, function(err, item) {
        expect(err).to.equal(null);
        expect(item).to.be.instanceOf(StorageItem);
        done();
      });
    });

    it('should return error if the data is not found', function(done) {
      var _dbget = sinon.stub(store._db, 'get').callsArgWith(
        1,
        new Error('Not found')
      );
      store._get(hash, function(err) {
        expect(err.message).to.equal('Not found');
        _dbget.restore();
        done();
      });
    });

    it('should return error if the data cannot be loaded', function(done) {
      var _storeexists = sinon.stub(store._fs, 'exists').callsArgWith(
        1,
        new Error('Failed')
      );
      store._get(hash, function(err) {
        expect(err.message).to.equal('Failed');
        _storeexists.restore();
        done();
      });
    });

  });

  describe('#_keys', function() {

    it('should return all of the keys', function(done) {
      store._keys(function(err, keys) {
        expect(keys[0]).to.equal('5e52fee47e6b070565f74372468cdc699de89107');
        done();
      });
    });

  });

  describe('#_del', function() {

    it('should return error if del fails', function(done) {
      var _dbdel = sinon.stub(store._db, 'del').callsArgWith(
        1,
        new Error('Failed to delete')
      );
      store._del(hash, function(err) {
        expect(err.message).to.equal('Failed to delete');
        _dbdel.restore();
        done();
      });
    });

    it('should return error if reset fails', function(done) {
      var _storereset = sinon.stub(store._fs, 'reset').callsArgWith(
        1,
        new Error('Failed to delete')
      );
      store._del(hash, function(err) {
        expect(err.message).to.equal('Failed to delete');
        _storereset.restore();
        done();
      });
    });

    it('should delete the shard if it exists', function(done) {
      store._del(hash, function(err) {
        expect(err).to.equal(null);
        done();
      });
    });

  });

});
