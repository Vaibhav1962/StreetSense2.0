from fastapi import APIRouter, Query
from typing import Optional, List
import httpx

router = APIRouter()

DELHI_LANDMARKS = [
    {"id": "1", "name": "India Gate", "address": "Rajpath, New Delhi", "category": "monument", "lat": 28.6129, "lng": 77.2295},
    {"id": "2", "name": "Red Fort", "address": "Netaji Subhash Marg, Chandni Chowk", "category": "monument", "lat": 28.6562, "lng": 77.2410},
    {"id": "3", "name": "Qutub Minar", "address": "Mehrauli, New Delhi", "category": "monument", "lat": 28.5244, "lng": 77.1855},
    {"id": "4", "name": "Lotus Temple", "address": "Bahapur, Shambhu Dayal Bagh", "category": "monument", "lat": 28.5535, "lng": 77.2588},
    {"id": "5", "name": "Humayun's Tomb", "address": "Mathura Road, Nizamuddin", "category": "monument", "lat": 28.5933, "lng": 77.2507},
    {"id": "6", "name": "Akshardham Temple", "address": "Noida Mor, Pandav Nagar", "category": "temple", "lat": 28.6127, "lng": 77.2773},
    {"id": "7", "name": "Jama Masjid", "address": "Jama Masjid Road, Chandni Chowk", "category": "mosque", "lat": 28.6507, "lng": 77.2334},
    {"id": "8", "name": "Connaught Place", "address": "New Delhi", "category": "market", "lat": 28.6315, "lng": 77.2167},
    {"id": "9", "name": "Lajpat Nagar Market", "address": "Lajpat Nagar, New Delhi", "category": "market", "lat": 28.5696, "lng": 77.2434},
    {"id": "10", "name": "Sarojini Nagar Market", "address": "Sarojini Nagar, New Delhi", "category": "market", "lat": 28.5753, "lng": 77.1957},
    {"id": "11", "name": "AIIMS Delhi", "address": "Ansari Nagar, New Delhi", "category": "hospital", "lat": 28.5672, "lng": 77.2100},
    {"id": "12", "name": "Safdarjung Hospital", "address": "Safdarjung Enclave, New Delhi", "category": "hospital", "lat": 28.5688, "lng": 77.2020},
    {"id": "13", "name": "IGI Airport T3", "address": "NH 48, New Delhi", "category": "transport", "lat": 28.5562, "lng": 77.0999},
    {"id": "14", "name": "New Delhi Railway Station", "address": "Ajmal Khan Road, Paharganj", "category": "transport", "lat": 28.6424, "lng": 77.2194},
    {"id": "15", "name": "Hazrat Nizamuddin Station", "address": "Mathura Road, Nizamuddin", "category": "transport", "lat": 28.5894, "lng": 77.2516},
    {"id": "16", "name": "Rajiv Chowk Metro", "address": "Connaught Place, New Delhi", "category": "metro", "lat": 28.6328, "lng": 77.2197},
    {"id": "17", "name": "Hauz Khas Village", "address": "Hauz Khas, New Delhi", "category": "market", "lat": 28.5494, "lng": 77.2001},
    {"id": "18", "name": "DLF Cyber City", "address": "DLF Phase 2, Gurugram", "category": "business", "lat": 28.4950, "lng": 77.0887},
    {"id": "19", "name": "Sector 18 Noida", "address": "Sector 18, Noida", "category": "market", "lat": 28.5708, "lng": 77.3219},
    {"id": "20", "name": "Jantar Mantar", "address": "Sansad Marg, New Delhi", "category": "monument", "lat": 28.6270, "lng": 77.2167},
    {"id": "21", "name": "Lal Quila", "address": "Chandni Chowk, Old Delhi", "category": "monument", "lat": 28.6562, "lng": 77.2410},
    {"id": "22", "name": "Dilli Haat INA", "address": "Sri Aurobindo Marg, INA", "category": "market", "lat": 28.5732, "lng": 77.2073},
    {"id": "23", "name": "Nehru Place", "address": "Nehru Place, New Delhi", "category": "business", "lat": 28.5481, "lng": 77.2518},
    {"id": "24", "name": "Karol Bagh Market", "address": "Karol Bagh, New Delhi", "category": "market", "lat": 28.6513, "lng": 77.1906},
    {"id": "25", "name": "Chandni Chowk", "address": "Old Delhi", "category": "market", "lat": 28.6506, "lng": 77.2303},
    {"id": "26", "name": "Paharganj Main Bazar", "address": "Paharganj, New Delhi", "category": "market", "lat": 28.6448, "lng": 77.2105},
    {"id": "27", "name": "Lodi Garden", "address": "Lodhi Road, New Delhi", "category": "park", "lat": 28.5930, "lng": 77.2228},
    {"id": "28", "name": "Nehru Park", "address": "Chanakyapuri, New Delhi", "category": "park", "lat": 28.5978, "lng": 77.1853},
    {"id": "29", "name": "Sanjay Van", "address": "Vasant Kunj, New Delhi", "category": "park", "lat": 28.5266, "lng": 77.1547},
    {"id": "30", "name": "Deer Park Hauz Khas", "address": "Hauz Khas, New Delhi", "category": "park", "lat": 28.5561, "lng": 77.1994},
    {"id": "31", "name": "Jawaharlal Nehru University", "address": "JNU Campus, New Delhi", "category": "education", "lat": 28.5409, "lng": 77.1667},
    {"id": "32", "name": "Delhi University North Campus", "address": "North Campus, New Delhi", "category": "education", "lat": 28.6876, "lng": 77.2124},
    {"id": "33", "name": "IIT Delhi", "address": "Hauz Khas, New Delhi", "category": "education", "lat": 28.5459, "lng": 77.1926},
    {"id": "34", "name": "Jamia Millia Islamia", "address": "Jamia Nagar, New Delhi", "category": "education", "lat": 28.5605, "lng": 77.2852},
    {"id": "35", "name": "National Museum", "address": "Janpath, New Delhi", "category": "museum", "lat": 28.6117, "lng": 77.2195},
    {"id": "36", "name": "Science Museum Pragati Maidan", "address": "Mathura Road, New Delhi", "category": "museum", "lat": 28.6188, "lng": 77.2450},
    {"id": "37", "name": "Rashtrapati Bhavan", "address": "Raisina Hill, New Delhi", "category": "government", "lat": 28.6143, "lng": 77.1994},
    {"id": "38", "name": "Parliament House", "address": "Sansad Marg, New Delhi", "category": "government", "lat": 28.6172, "lng": 77.2097},
    {"id": "39", "name": "Supreme Court of India", "address": "Tilak Marg, New Delhi", "category": "government", "lat": 28.6226, "lng": 77.2401},
    {"id": "40", "name": "Pragati Maidan", "address": "Mathura Road, New Delhi", "category": "event", "lat": 28.6187, "lng": 77.2457},
    {"id": "41", "name": "Jawaharlal Nehru Stadium", "address": "Bhishma Pitamah Marg", "category": "sports", "lat": 28.5816, "lng": 77.2378},
    {"id": "42", "name": "Indira Gandhi Stadium", "address": "Indraprastha Estate", "category": "sports", "lat": 28.6427, "lng": 77.2514},
    {"id": "43", "name": "Agrasen Ki Baoli", "address": "Hailey Road, Connaught Place", "category": "monument", "lat": 28.6289, "lng": 77.2258},
    {"id": "44", "name": "Purana Qila", "address": "Mathura Road, New Delhi", "category": "monument", "lat": 28.6096, "lng": 77.2416},
    {"id": "45", "name": "Safdarjung Tomb", "address": "Aurobindo Marg, New Delhi", "category": "monument", "lat": 28.5906, "lng": 77.2067},
    {"id": "46", "name": "Bangla Sahib Gurudwara", "address": "Ashoka Road, New Delhi", "category": "temple", "lat": 28.6267, "lng": 77.2094},
    {"id": "47", "name": "Birla Mandir", "address": "Mandir Marg, New Delhi", "category": "temple", "lat": 28.6340, "lng": 77.2019},
    {"id": "48", "name": "ISKCON Temple", "address": "Sant Nagar, East of Kailash", "category": "temple", "lat": 28.5530, "lng": 77.2619},
    {"id": "49", "name": "Chhatarpur Temple", "address": "Chhatarpur, New Delhi", "category": "temple", "lat": 28.4965, "lng": 77.1601},
    {"id": "50", "name": "Max Hospital Saket", "address": "Press Enclave Road, Saket", "category": "hospital", "lat": 28.5265, "lng": 77.2157},
    {"id": "51", "name": "Apollo Hospital Sarita Vihar", "address": "Mathura Road, New Delhi", "category": "hospital", "lat": 28.5341, "lng": 77.2842},
    {"id": "52", "name": "Fortis Hospital Vasant Kunj", "address": "Sector B, Vasant Kunj", "category": "hospital", "lat": 28.5199, "lng": 77.1606},
    {"id": "53", "name": "Sir Ganga Ram Hospital", "address": "Rajinder Nagar, New Delhi", "category": "hospital", "lat": 28.6367, "lng": 77.1891},
    {"id": "54", "name": "Moolchand Hospital", "address": "Lala Lajpat Rai Marg", "category": "hospital", "lat": 28.5717, "lng": 77.2392},
    {"id": "55", "name": "Select Citywalk Mall", "address": "Saket District Centre", "category": "mall", "lat": 28.5270, "lng": 77.2193},
    {"id": "56", "name": "DLF Mall of India Noida", "address": "Sector 18, Noida", "category": "mall", "lat": 28.5675, "lng": 77.3213},
    {"id": "57", "name": "Ambience Mall Vasant Kunj", "address": "NH 48, Vasant Kunj", "category": "mall", "lat": 28.5278, "lng": 77.1549},
    {"id": "58", "name": "Pacific Mall Subhash Nagar", "address": "Subhash Nagar, New Delhi", "category": "mall", "lat": 28.6469, "lng": 77.1082},
    {"id": "59", "name": "Ansal Plaza", "address": "Khel Gaon Marg, New Delhi", "category": "mall", "lat": 28.5669, "lng": 77.2183},
    {"id": "60", "name": "Kashmiri Gate ISBT", "address": "Kashmiri Gate, Delhi", "category": "transport", "lat": 28.6675, "lng": 77.2264},
    {"id": "61", "name": "Anand Vihar ISBT", "address": "Anand Vihar, Delhi", "category": "transport", "lat": 28.6471, "lng": 77.3145},
    {"id": "62", "name": "Karol Bagh Metro", "address": "Karol Bagh, New Delhi", "category": "metro", "lat": 28.6509, "lng": 77.1908},
    {"id": "63", "name": "Huda City Centre Metro", "address": "Sector 29, Gurugram", "category": "metro", "lat": 28.4594, "lng": 77.0728},
    {"id": "64", "name": "Noida Sector 52 Metro", "address": "Sector 52, Noida", "category": "metro", "lat": 28.6196, "lng": 77.3620},
    {"id": "65", "name": "Vasant Vihar", "address": "Vasant Vihar, New Delhi", "category": "residential", "lat": 28.5613, "lng": 77.1588},
    {"id": "66", "name": "Defence Colony", "address": "Defence Colony, New Delhi", "category": "residential", "lat": 28.5701, "lng": 77.2284},
    {"id": "67", "name": "Green Park", "address": "Green Park, New Delhi", "category": "residential", "lat": 28.5600, "lng": 77.2084},
    {"id": "68", "name": "Khan Market", "address": "Khan Market, New Delhi", "category": "market", "lat": 28.6007, "lng": 77.2276},
    {"id": "69", "name": "Sunder Nursery", "address": "Nizamuddin, New Delhi", "category": "park", "lat": 28.5950, "lng": 77.2481},
    {"id": "70", "name": "Tughlaqabad Fort", "address": "Tughlaqabad, New Delhi", "category": "monument", "lat": 28.5051, "lng": 77.2614},
    {"id": "71", "name": "Dwarka Sector 21 Metro", "address": "Dwarka Sector 21, New Delhi", "category": "metro", "lat": 28.5521, "lng": 77.0588},
    {"id": "72", "name": "Dwarka Expressway", "address": "Dwarka, New Delhi", "category": "transport", "lat": 28.5934, "lng": 77.0471},
    {"id": "73", "name": "Ambience Mall Gurugram", "address": "NH 48, Gurugram", "category": "mall", "lat": 28.5006, "lng": 77.0916},
    {"id": "74", "name": "Cyber Hub Gurugram", "address": "DLF Cyber City, Gurugram", "category": "food", "lat": 28.4956, "lng": 77.0891},
    {"id": "75", "name": "Garden of Five Senses", "address": "Said-ul-Ajaib, New Delhi", "category": "park", "lat": 28.5097, "lng": 77.1983},
    {"id": "76", "name": "Roshanara Garden", "address": "Civil Lines, New Delhi", "category": "park", "lat": 28.6920, "lng": 77.1961},
    {"id": "77", "name": "Ram Lila Maidan", "address": "Ajmeri Gate, New Delhi", "category": "event", "lat": 28.6427, "lng": 77.2309},
    {"id": "78", "name": "ITO", "address": "Bahadur Shah Zafar Marg", "category": "government", "lat": 28.6287, "lng": 77.2555},
    {"id": "79", "name": "Daryaganj", "address": "Old Delhi", "category": "market", "lat": 28.6465, "lng": 77.2339},
    {"id": "80", "name": "Greater Noida Expo Centre", "address": "Greater Noida", "category": "event", "lat": 28.4700, "lng": 77.4920},
    {"id": "81", "name": "Noida Film City", "address": "Sector 16A, Noida", "category": "business", "lat": 28.6084, "lng": 77.3523},
    {"id": "82", "name": "Fortis Escorts Heart Institute", "address": "Okhla Road, New Delhi", "category": "hospital", "lat": 28.5531, "lng": 77.2740},
    {"id": "83", "name": "Manipal Hospital Dwarka", "address": "Sector 6, Dwarka", "category": "hospital", "lat": 28.5888, "lng": 77.0595},
    {"id": "84", "name": "Saket Metro Station", "address": "Press Enclave Road, Saket", "category": "metro", "lat": 28.5248, "lng": 77.2145},
    {"id": "85", "name": "Chattarpur Metro Station", "address": "Chhatarpur, New Delhi", "category": "metro", "lat": 28.5072, "lng": 77.1597},
    {"id": "86", "name": "Mehrauli Archaeological Park", "address": "Mehrauli, New Delhi", "category": "park", "lat": 28.5229, "lng": 77.1897},
    {"id": "87", "name": "Coronation Park", "address": "Kingsway Camp, New Delhi", "category": "park", "lat": 28.7069, "lng": 77.2183},
    {"id": "88", "name": "DDA Yamuna Biodiversity Park", "address": "Wazirabad, New Delhi", "category": "park", "lat": 28.7354, "lng": 77.2329},
    {"id": "89", "name": "Secretariat Building", "address": "Raisina Hill, New Delhi", "category": "government", "lat": 28.6146, "lng": 77.2063},
    {"id": "90", "name": "Vigyan Bhavan", "address": "Maulana Ali Jauhar Marg", "category": "government", "lat": 28.6193, "lng": 77.2131},
    {"id": "91", "name": "National Zoological Park", "address": "Mathura Road, New Delhi", "category": "park", "lat": 28.6078, "lng": 77.2380},
    {"id": "92", "name": "Laxmi Nagar", "address": "Laxmi Nagar, East Delhi", "category": "residential", "lat": 28.6297, "lng": 77.2767},
    {"id": "93", "name": "Shahdara", "address": "Shahdara, East Delhi", "category": "residential", "lat": 28.6702, "lng": 77.2895},
    {"id": "94", "name": "Rohini Sector 3", "address": "Rohini, New Delhi", "category": "residential", "lat": 28.7262, "lng": 77.1122},
    {"id": "95", "name": "Pitampura", "address": "Pitampura, New Delhi", "category": "residential", "lat": 28.7021, "lng": 77.1323},
    {"id": "96", "name": "South Extension Market", "address": "South Extension, New Delhi", "category": "market", "lat": 28.5811, "lng": 77.2116},
    {"id": "97", "name": "Greater Kailash Market", "address": "Greater Kailash, New Delhi", "category": "market", "lat": 28.5485, "lng": 77.2393},
    {"id": "98", "name": "Dlf Galleria Gurugram", "address": "DLF Phase 4, Gurugram", "category": "mall", "lat": 28.4721, "lng": 77.0810},
    {"id": "99", "name": "Iffco Chowk", "address": "Sector 28, Gurugram", "category": "transport", "lat": 28.4756, "lng": 77.0747},
    {"id": "100", "name": "Faridabad Old City", "address": "Old Faridabad, Haryana", "category": "residential", "lat": 28.4089, "lng": 77.3178},
    {"id": "101", "name": "Sector 29 Faridabad", "address": "Sector 29, Faridabad", "category": "residential", "lat": 28.4254, "lng": 77.3028},
    {"id": "102", "name": "Palwal", "address": "Palwal, Haryana", "category": "residential", "lat": 28.1441, "lng": 77.3319},
]


@router.get("/search")
@router.get("/search")
async def search_places(
    q: str = Query(..., min_length=1),
    category: Optional[str] = None,
    limit: int = Query(default=10, le=50),
    viewbox: Optional[str] = Query(None, description="Left,Top,Right,Bottom bounding box"),
):
    query_lower = q.lower()
    results = []
    
    # 1. Match local landmarks first
    for landmark in DELHI_LANDMARKS:
        if category and landmark["category"] != category:
            continue
        if query_lower in landmark["name"].lower() or query_lower in landmark["address"].lower():
            results.append(landmark)
            if len(results) >= limit:
                return results

    # 2. Add Nominatim global search for general locations if not filtered by strict categories or if category is 'hospital'
    # Actually, for the global search bar we want Nominatim anytime limit is not reached
    if len(results) < limit:
        # Nominatim supports viewbox. If category is hospital, append it to query
        nominatim_q = f"hospital {q}" if category == "hospital" else q
        # If searching just for 'hospital' without other terms
        if not q and category == "hospital":
            nominatim_q = "hospital"
            
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                resp = await client.get(
                    "https://nominatim.openstreetmap.org/search",
                    params={
                        "q": nominatim_q, 
                        "format": "json", 
                        "limit": limit - len(results), 
                        "bounded": 0,
                        "viewbox": viewbox or "76.5,29.0,77.8,28.2" # Use provided viewbox or fallback broader Delhi NCR
                    },
                    headers={"User-Agent": "StreetSense/3.0"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    for item in data:
                        name = item.get("display_name", "").split(",")[0]
                        address = item.get("display_name", "")
                        results.append({
                            "id": str(item.get("place_id", hash(item["lat"]))),
                            "name": name,
                            "address": address,
                            "category": category or item.get("type", "location"),
                            "lat": float(item["lat"]),
                            "lng": float(item["lon"])
                        })
            except Exception:
                pass

    return results[:limit]


@router.get("/landmarks")
async def list_landmarks(
    category: Optional[str] = None,
    limit: int = Query(default=50, le=200),
):
    if category:
        filtered = [l for l in DELHI_LANDMARKS if l["category"] == category]
    else:
        filtered = DELHI_LANDMARKS
    return filtered[:limit]


@router.get("/geocode")
async def geocode(q: str = Query(..., min_length=3)):
    """Geocode via Nominatim OSM"""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": q, "format": "json", "limit": 5, "bounded": 1,
                        "viewbox": "76.8,28.8,77.6,28.4"},
                headers={"User-Agent": "StreetSense/3.0"},
            )
            data = resp.json()
            return [
                {
                    "name": item.get("display_name", ""),
                    "lat": float(item["lat"]),
                    "lng": float(item["lon"]),
                    "type": item.get("type", ""),
                }
                for item in data
            ]
        except Exception as e:
            return []
