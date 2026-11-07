import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class Checkout {
    private static final Logger logger = LoggerFactory.getLogger("checkout");

    public static void main(String[] args) {
        logger.atInfo().addKeyValue("app.order.id", "demo-101").addKeyValue("app.amount", 42.5).log("Order accepted");
        logger.atWarn().addKeyValue("app.order.id", "demo-102").addKeyValue("app.amount", 18.0).log("Payment retry scheduled");
        logger.atError().addKeyValue("app.order.id", "demo-103").addKeyValue("app.amount", 72.0).log("Payment rejected");
    }
}
