const pool = require("../models/connection");

const campaigns = async function (req, res) {
  try {
    const { email } = req.user;
    const query =
      "SELECT campaign.*, COUNT(DISTINCT sent.receiver) AS email_sent FROM campaign LEFT JOIN sent ON sent.campaign_id = campaign.campaign_id LEFT JOIN bounced ON bounced.campaign_id = campaign.campaign_id LEFT JOIN opened ON opened.campaign_id = campaign.campaign_id WHERE campaign.sender = ? GROUP BY campaign.campaign_id ORDER BY `campaign`.`time_stamp` DESC;";
    const values = [email];

    var [results] = await pool.promise().execute(query, values);
    if (results.length > 0) {
      res.status(200).json({ success: true, campaigns: results });
    } else {
      res.status(200).json({ success: true, campaigns: [] });
    }
  } catch (err) {
    res.status(500).json({ err });
  }
};

async function campaign(req, res) {
  try {
    const campaignId = req.params.id; // Replace with the actual campaign_id
    const query = `
      SELECT receiver AS email,
        MAX(CASE WHEN event_type = 'sent' THEN time_at END) AS sent_at,
        MAX(CASE WHEN event_type = 'bounced' THEN time_at END) AS bounced_at
      FROM (
        SELECT receiver, 'sent' AS event_type, sent.time_stamp AS time_at, sent.campaign_id AS sent_campaign_id
        FROM sent
        JOIN campaign ON sent.campaign_id = campaign.campaign_id
        WHERE campaign.sender = "${req.user.email}" AND campaign.campaign_id = "${campaignId}"
        UNION ALL
        SELECT receiver, 'bounced' AS event_type, bounced.time_stamp AS time_at, bounced.campaign_id AS bounced_campaign_id
        FROM bounced
        JOIN campaign ON bounced.campaign_id = campaign.campaign_id
        WHERE campaign.sender = "${req.user.email}" AND campaign.campaign_id = "${campaignId}"
      ) AS unique_events
      GROUP BY email
      ORDER BY MAX(time_at) DESC;
    `;
    const [results] = await pool.promise().execute(query);
    if (results.length > 0) {
      res.status(200).json({ success: true, campaign: results });
    } else {
      res.status(200).json({ success: true, campaigns: [] });
    }
  } catch (err) {
    console.log(err);
  }
}

module.exports = {
  campaigns,
  campaign,
};
