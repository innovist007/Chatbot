from app.modules.web_cr.tabs.campaigns.service import CampaignsTabService
from app.modules.web_cr.tabs.channels.service import ChannelsTabService
from app.modules.web_cr.tabs.overview.service import OverviewTabService
from app.modules.web_cr.tabs.pages.service import PagesTabService


class WebCRService(OverviewTabService, ChannelsTabService, PagesTabService, CampaignsTabService):
    """
    Facade: aggregates all four tab services via multiple inheritance.
    All public methods from every tab are accessible on one instance.
    Python MRO resolves to a single WebCRBase.__init__ call — no duplicate clients.

    Tab → service mapping:
      Overview  : OverviewTabService  (overview, funnel, by_*, cr_trend, funnel_trend, …)
      Channels  : ChannelsTabService  (channel_table, channel_trend, funnel_by_channel, …)
      Pages     : PagesTabService     (content_group_cr, product_pages, landing_page_funnel_trend, …)
      Campaigns : CampaignsTabService (top_campaigns)
    Shared infra (BQ, Redis, helpers) : WebCRBase
    """
