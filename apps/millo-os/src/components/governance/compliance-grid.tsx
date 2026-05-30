export default function ComplianceGrid() {
const docs = [
"Privacy Policy",
"Terms",
"Creator Terms",
"Seller Agreement",
"Auction Policy",
"Refund Policy"
]

return ( <div className="grid md:grid-cols-3 gap-6">
{docs.map(doc => ( <div
       key={doc}
       className="surface p-6"
     >
{doc} </div>
))} </div>
)
}
