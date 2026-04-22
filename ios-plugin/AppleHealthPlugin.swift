import Capacitor
import HealthKit

@objc(AppleHealthPlugin)
public class AppleHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleHealthPlugin"
    public let jsName = "AppleHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPermissionsState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getTodayActiveCalories", returnType: CAPPluginReturnPromise)
    ]

    private let healthStore = HKHealthStore()

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func getPermissionsState(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["state": "unavailable"])
            return
        }

        guard let activeType = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) else {
            call.resolve(["state": "unavailable"])
            return
        }

        let status = healthStore.authorizationStatus(for: activeType)
        switch status {
        case .sharingAuthorized:
            call.resolve(["state": "granted"])
        case .sharingDenied:
            call.resolve(["state": "denied"])
        default:
            call.resolve(["state": "unknown"])
        }
    }

    @objc func requestPermissions(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(),
              let activeType = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) else {
            call.resolve(["state": "unavailable"])
            return
        }

        healthStore.requestAuthorization(toShare: [], read: Set([activeType])) { success, _ in
            if !success {
                call.resolve(["state": "denied"])
                return
            }

            let status = self.healthStore.authorizationStatus(for: activeType)
            switch status {
            case .sharingAuthorized:
                call.resolve(["state": "granted"])
            case .sharingDenied:
                call.resolve(["state": "denied"])
            default:
                call.resolve(["state": "unknown"])
            }
        }
    }

    @objc func getTodayActiveCalories(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(),
              let type = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) else {
            call.reject("HealthKit unavailable")
            return
        }

        let now = Date()
        let startOfDay = Calendar.current.startOfDay(for: now)
        let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: now, options: .strictStartDate)

        let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, stats, error in
            if let error = error {
                call.reject("Failed to read active energy: \(error.localizedDescription)")
                return
            }

            let kcal = stats?.sumQuantity()?.doubleValue(for: HKUnit.kilocalorie()) ?? 0
            call.resolve([
                "activeKcal": kcal,
                "syncedAt": ISO8601DateFormatter().string(from: now)
            ])
        }

        healthStore.execute(query)
    }
}
