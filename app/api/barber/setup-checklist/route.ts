import { NextResponse } from "next/server";
import { isBarberAccountRole } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/booking/route-auth";
import {
  activatePr27BarberSetup,
  getPr27BarberSetup,
  ProductPr27ServiceError
} from "@/lib/trust/product-pr27-service";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!isBarberAccountRole(user.role)) {
      return NextResponse.json({ error: "Barber setup is available only to Barber accounts." }, { status: 403 });
    }
    return NextResponse.json(await getPr27BarberSetup(user));
  } catch (error) {
    if (error instanceof ProductPr27ServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to load Barber setup." }, { status: 500 });
  }
}

export async function POST() {
  try {
    const user = await getSessionUser();
    if (!isBarberAccountRole(user.role)) {
      return NextResponse.json({ error: "Barber setup is available only to Barber accounts." }, { status: 403 });
    }
    return NextResponse.json(await activatePr27BarberSetup(user));
  } catch (error) {
    if (error instanceof ProductPr27ServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to activate this chair." }, { status: 500 });
  }
}
