"""RetentionService facade — combines all 5 tab services into one class.

Used by d2c_overview (and any external caller that needs a single object
with all retention methods accessible via dot-notation).

Python MRO resolves to a single RetentionBase.__init__ call — one BQ client,
one Redis connection.
"""
from app.modules.retention.tabs.overview.service import OverviewService
from app.modules.retention.tabs.trend.service import TrendService
from app.modules.retention.tabs.product.service import ProductService
from app.modules.retention.tabs.acquisition_quality.service import AcquisitionQualityService
from app.modules.retention.tabs.unit_economics.service import UnitEconomicsService


class RetentionService(
    OverviewService,
    TrendService,
    ProductService,
    AcquisitionQualityService,
    UnitEconomicsService,
):
    """
    All retention methods accessible on one instance.

    Tab → service mapping:
      Tab 1 Overview           : OverviewService
      Tab 2 Retention Trend    : TrendService
      Tab 3 Product            : ProductService
      Tab 4 Acquisition Qual.  : AcquisitionQualityService
      Tab 5 Unit Economics     : UnitEconomicsService
    Shared infra (BQ + Redis)  : RetentionBase
    """
