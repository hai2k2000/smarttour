import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CreateQuoteComboDto, UpdateQuoteComboDto } from './dto/quote-combo.dto';
import { CreateQuoteTourDto, QuoteApprovalDto, UpdateQuoteTourDto } from './dto/quote-tour.dto';
import { QuotesService } from './quotes.service';

@ApiTags('quotes')
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Get('tours')
  @RequirePermissions('quote.view')
  listTours(@Query('search') search?: string, @Req() request?: { user?: RequestUser }) {
    return this.quotesService.listTourQuotes(search, request?.user);
  }

  @Get('tours/:id')
  @RequirePermissions('quote.view')
  tourDetail(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.quotesService.getTourQuote(id, request?.user);
  }

  @Post('tours')
  @RequirePermissions('quote.manage')
  createTour(@Body() dto: CreateQuoteTourDto, @Req() request?: { user?: RequestUser }) {
    return this.quotesService.createTourQuote(dto, request?.user);
  }

  @Put('tours/:id')
  @RequirePermissions('quote.manage')
  updateTour(@Param('id') id: string, @Body() dto: UpdateQuoteTourDto, @Req() request?: { user?: RequestUser }) {
    return this.quotesService.updateTourQuote(id, dto, request?.user);
  }

  @Delete('tours/:id')
  @RequirePermissions('quote.manage')
  deleteTour(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.quotesService.deleteTourQuote(id, request?.user);
  }

  @Post('tours/:id/approve')
  @RequirePermissions('quote.approve')
  approveTour(@Param('id') id: string, @Body() dto: QuoteApprovalDto, @Req() request?: { user?: RequestUser }) {
    return this.quotesService.approveTourQuote(id, dto, request?.user);
  }

  @Post('tours/:id/reject')
  @RequirePermissions('quote.manage')
  rejectTour(@Param('id') id: string, @Body() dto: QuoteApprovalDto, @Req() request?: { user?: RequestUser }) {
    return this.quotesService.rejectTourQuote(id, dto, request?.user);
  }

  @Post('tours/:id/convert')
  @RequirePermissions('quote.manage')
  convertTour(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.quotesService.convertTourQuote(id, request?.user);
  }

  @Get('combos')
  @RequirePermissions('quote.view')
  listCombos(@Query('search') search?: string) {
    return this.quotesService.listComboQuotes(search);
  }

  @Get('combos/:id')
  @RequirePermissions('quote.view')
  comboDetail(@Param('id') id: string) {
    return this.quotesService.getComboQuote(id);
  }

  @Post('combos')
  @RequirePermissions('quote.manage')
  createCombo(@Body() dto: CreateQuoteComboDto) {
    return this.quotesService.createComboQuote(dto);
  }

  @Put('combos/:id')
  @RequirePermissions('quote.manage')
  updateCombo(@Param('id') id: string, @Body() dto: UpdateQuoteComboDto) {
    return this.quotesService.updateComboQuote(id, dto);
  }

  @Delete('combos/:id')
  @RequirePermissions('quote.manage')
  deleteCombo(@Param('id') id: string) {
    return this.quotesService.deleteComboQuote(id);
  }

  @Post('combos/:id/create-quote')
  @RequirePermissions('quote.manage')
  createQuoteFromCombo(@Param('id') id: string) {
    return this.quotesService.createQuoteFromCombo(id);
  }

  @Post('combos/:id/create-order')
  @RequirePermissions('quote.manage')
  createOrderFromCombo(@Param('id') id: string) {
    return this.quotesService.createOrderFromCombo(id);
  }

  @Post('combos/:id/recalculate')
  @RequirePermissions('quote.manage')
  recalculateCombo(@Param('id') id: string) {
    return this.quotesService.recalculateCombo(id);
  }
}
