class SeverityIndexer:
    @staticmethod
    def evaluate_hazard(area_m2: float) -> dict:
        """
        Classifies hazard severity and assigns dispatch priority based on total surface area.
        """
        if area_m2 < 5.0:
            return {"level": "LOW", "score": 1, "action": "Monitor routine conditions."}
        elif 5.0 <= area_m2 < 25.0:
            return {"level": "MODERATE", "score": 2, "action": "Schedule standard maintenance check."}
        elif 25.0 <= area_m2 < 75.0:
            return {"level": "HIGH", "score": 3, "action": "Dispatch local maintenance crew."}
        else:
            return {"level": "CRITICAL", "score": 4, "action": "Issue emergency response and traffic reroute."}