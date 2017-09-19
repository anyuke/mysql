var mysql = require('mysql');
var s_num_reg = new RegExp("^[0-9]{1,}$");

function number_check(val) {
    // 查询是否是数字
    return s_num_reg.test(val);
}

var config = {
    mysql: {
        connectionLimit: 10,
        host: '127.0.0.1',
        port: 3306,
        user: 'majiang',
        password: 'password',
        database: 'majiang-huaian',
        charset: 'utf8mb4',
        debug: false
    }
};

// 创建连接池
var pool = mysql.createPool(config.mysql);

module.exports = {
    getConnection: function(callback) {
        if (typeof callback != "function") {
            return;
        }
        if (pool === null) {
            pool = mysql.createPool(config.mysql);
        }
        pool.getConnection(callback);
    },

    /**
     * 执行一条sql
     *
     * @Author   Anyuke
     * @DateTime 2017-09-19
     * @param    {string}   sql      sql语句
     * @param    {array}   params    参数数组
     * @param    {Function} callback [description]
     * @return   {array[object]}      json数组
     */
    execute: function(sql, params, callback) {
        if (pool === null) {
            pool = mysql.createPool(config.mysql);
        }
        pool.getConnection(function(err, coon) {
            if (err) {
                if (callback) {
                    return callback(err, null);
                }
                return false;
            }
            coon.query(sql, params, function(err, results) {
                coon.release();
                if (callback) {
                    return callback(err, results);
                }
                return results;
            });
        });
    },

    /**
     * 执行多条sql(数组)
     *
     * @Author   Anyuke
     * @DateTime 2017-09-19
     * @param    {array}   sqls      sql数组
     * @param    {array}   params    参数数组
     * @param    {Function} callback [description]
     * @return   {array[object]}      json数组
     */
    executeArray: function(sqls, params, callback) {
        if (typeof (callback) != "function") {
            throw new Error("system error");
        }
        if (!(sqls instanceof Array) || !(params instanceof Array)) {
            callback(new Error("param error"));
            return;
        }
        if (pool === null) {
            pool = mysql.createPool(config.mysql);
        }
        pool.getConnection(function(err, coon) {
            if (err) {
                if (callback) {
                    return callback(err, []);
                }
                return false;
            }
            (function(idx, results) {
                function next(err, result) {
                    if (err) {
                        coon.release();
                        callback(err, []);
                        return;
                    }
                    idx++;
                    if (idx >= 1) {
                        results.push(result);
                    }
                    if (idx >= sqls.length) {
                        coon.release();
                        callback(null, results);
                        return;
                    }
                    var sql = sqls[idx];
                    var param = params[idx];
                    coon.query(sql, param, next);
                }
                next();
            })(-1, []);
        });
    },

    /**
     * 分页查询
     *
     * @Author   Anyuke
     * @DateTime 2017-09-19
     * @param    {string}   sql      sql
     * @param    {number}   from_idx 开始
     * @param    {number}   to_idx   结束
     * @param    {array}   params    参数
     * @param    {Function} callback [description]
     * @return   {object}            结果和查询总数
     */
    query_page: function(sql, from_idx, to_idx, params, callback) {
        if (!number_check(from_idx) || !number_check(to_idx)) {
            callback(new Error("param error"));
            return;
        }
        if (typeof (sql) != "string") {
            callback(new Error("param error"));
            return;
        }
        if (typeof (callback) != "function") {
            throw new Error("system error");
        }
        if (pool === null) {
            pool = mysql.createPool(config.mysql);
        }
        pool.getConnection(function(err, coon) {
            if (err) {
                if (callback) {
                    return callback(err, null);
                }
                return false;
            }
            var sql_count = "select count(1) as cnt from (" + sql + ")tab_page";
            coon.query(sql_count, params, function(err, results1) {
                if (err) {
                    coon.release();
                    if (callback) {
                        callback(err);
                    }
                    return;
                }
                var sql_page = sql + " limit " + from_idx + " , " + to_idx;
                coon.query(sql_page, params, function(err, results) {
                    coon.release();
                    if (callback) {
                        return callback(err, results, results1[0].cnt);
                    }
                });
            });
        });
    },

    /**
     * 运用事务执行多条sql(数组)
     *
     * @Author   Anyuke
     * @DateTime 2017-09-19
     * @param    {array}   sqls     sql数组
     * @param    {array}   params   参数数组
     * @param    {Function} callback [description]
     * @return   {[type]}            [description]
     */
    executeArraySafe: function(sqls, params, callback) {
        if (typeof (callback) != "function") {
            throw new Error("system error");
        }
        if (!(sqls instanceof Array) || !(params instanceof Array)) {
            callback(new Error("param error"));
            return;
        }
        if (pool === null) {
            pool = mysql.createPool(config.mysql);
        }
        pool.getConnection(function(err, coon) {
            if (err) {
                if (callback) {
                    return callback(err, []);
                }
                return false;
            }
            coon.beginTransaction(function(err) {
                if (err) {
                    logger.error(err);
                    coon.release();
                    return callback(err, []);
                }
                (function(idx, results) {
                    function next(err, result) {
                        if (err) {
                            logger.error(err);
                            coon.rollback();
                            coon.release();
                            callback(err, results);
                            return;
                        }
                        idx++;
                        if (idx >= 1) {
                            results.push(result);
                        }
                        if (idx >= sqls.length) {
                            coon.commit(function(err) {
                                if (err) {
                                    logger.error(err);
                                    coon.rollback();
                                    coon.release();
                                    callback(err, results);
                                    return;
                                }
                                coon.release();
                                callback(null, results);
                            });
                            return;
                        }
                        var sql = sqls[idx];
                        var param = params[idx];
                        coon.query(sql, param, next);
                    }
                    next();
                })(-1, []);
            });
        });
    },

    /**
     * 运用事务执行多条sql(数组) 下一条执行sql可以获取上一条执行sql的值
     *
     * @Author   Anyuke
     * @DateTime 2017-09-19
     * @param    {array}   sqls     sql数组
     * @param    {array}   params   参数数组
     * @param    {Function} callback [description]
     * @return   {[type]}            [description]
     */
    executeArraySafe2: function(sqls, params, eachCallback, callback) {
        if (typeof (callback) != "function") {
            throw new Error("system error");
        }
        if (!(sqls instanceof Array) || !(params instanceof Array)) {
            callback(new Error("param error"));
            return;
        }
        if (pool === null) {
            pool = mysql.createPool(config.mysql);
        }
        pool.getConnection(function(err, coon) {
            if (err) {
                if (callback) {
                    return callback(err, []);
                }
                return false;
            }
            coon.beginTransaction(function(err) {
                if (err) {
                    logger.error(err);
                    coon.release();
                    return callback(err, []);
                }
                (function(idx, results) {
                    function next(err, result) {
                        if (err) {
                            logger.error(err);
                            coon.rollback();
                            coon.release();
                            callback(err, results);
                            return;
                        }
                        idx++;
                        if (idx >= 1) {
                            results.push(result);
                        }
                        if (idx >= sqls.length) {
                            coon.commit(function(err) {
                                if (err) {
                                    logger.error(err);
                                    coon.rollback();
                                    coon.release();
                                    callback(err, results);
                                    return;
                                }
                                coon.release();
                                callback(null, results);
                            });
                            return;
                        }
                        var sql = sqls[idx];
                        var param = params[idx];
                        coon.query(sql, param, function(err, result) {
                            if (err) {
                                next(err);
                                return;
                            }
                            eachCallback({
                                index: idx,
                                sqls: sqls,
                                params: params,
                                result: result
                            }, function(err) {
                                if (err) {
                                    next(err);
                                    return;
                                }
                                next(null, result);
                            });
                        });
                    }
                    next();
                })(-1, []);
            });
        });
    }
};