var mysqlUtil = require("./mysqlUtil");

var sql1 = " select ifnull(sum(t.money),0) as totalRecharge " +
    " from tb_agent_recharge t  " +
    " where t.agentId = ? " +
    " and t.createTime between ? and ? ";
var param1 = [agentId, start, end];

// 房主开房
var sql2 = "select count(1) as cnt " +
    " from tb_user_games t  " +
    " where t.creator = ? " +
    " and t.createTime between ? and ? " +
    " and t.payWay = ?";
var param2 = [gameId, start, end, TB_USER_GAMES_PAYWAY_0];

var sql3 = "select count(1) as cnt " +
    " from tb_user_games t  " +
    " inner join tb_user_games_detail t2 " +
    " on t2.roomRecordId = t.id " +
    " where t2.userId = ? " +
    " and t.createTime between ? and ? " +
    " and t.payWay = ?";
var param3 = [gameId, start, end, TB_USER_GAMES_PAYWAY_1];

// 出售
var sql4 = " select ifnull(sum(t.amount),0) as totalSale " +
    " from tb_agent_account_record t  " +
    " where t.agentId = ? " +
    " and t.createTime between ? and ? " +
    " and t.tradeType = ?";
var param4 = [agentId, start, end, TB_AGENT_RECORD_TRADETYPE_0];

// 执行多条sql
mysqlUtil.executeArray([sql1, sql2, sql3, sql4], [param1, param2, param3, param4], function (err, result) {
    if (err) {
        logger.error(err);
        return utils.response(res, message.SYSTEM_ERROR);
    }
    var  data = {
        openRoom: result[1][0].cnt + result[2][0].cnt,
        recharge: result[0][0].totalRecharge,
        sale: result[3][0].totalSale
    };
    return utils.response(res, { code: 0, message: "success", data: data });
});

var from_idx = (index - 1) * pageNum;
var to_idx = from_idx + pageNum;
// 分页查询
mysqlUtil.query_page(sql, from_idx, to_idx, [agentId, start, end], function(err, result, totalCount){
    if (err) {
        logger.error(err);
        return utils.response(res, message.SYSTEM_ERROR);
    }
    var data = {
        list: result,
        totalCount: totalCount
    };
    return utils.response(res, { code: 0, message: "success", data: data });
});

// 执行单条sql
mysqlUtil.execute(sql2, param2, function(err, result2) {
    if (err) {
        logger.error(err);
        return utils.response(res, message.SYSTEM_ERROR);
    }
    return utils.response(res, {
        code: 0,
        message: "success",
        data: result2[0]
    });
});
mysqlUtil.execute('update tb_agent set ? where id = ?', [{ lastLoginTime: new Date().getTime(), updateTime: new Date().getTime() }, agentId]);
mysqlUtil.execute('insert into tb_agent_login_record set ?', [{ agentId: agentId, method: '微信登录', ip: utils.getClientIp(req), createTime: new Date().getTime() }]);
// 插入 若已有记录则执行更新操作
mysqlUtil.execute('INSERT INTO tb_download SET ? ON DUPLICATE KEY UPDATE updateTime = ?', [{userId: userId, unionid: unionid, ip: utils.getClientIp(req), status: 1, createTime: new Date().getTime()}, new Date().getTime()]);

// 事务执行sql，报错回滚
mysqlUtil.executeArraySafe(sqls, params, function (err, result) {
    logger.info("update member recharge order result:%j", result);
    callback(err);
});

// 事务执行sql，下一跳sql获取上一条sql的执行结果，报错回滚
mysqlUtil.executeArraySafe2([sql, sql2, sql3], [params, param2, param3], 
	function(info, next) {
        if (info.index == 0) {
            var result = info.result;
            logger.debug("inserted manager id :%d", result.insertId);
            info.params[1][0].managerId = result.insertId;
            info.params[2][0].managerId = result.insertId;
        }
        next();
    },
    function(err, results) {
        if (err) {
            logger.error(err);
            return utils.response(res, {code: -1, message: err.message});
        }
        return utils.response(res, message.SUCCESS);
    });
