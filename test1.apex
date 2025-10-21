public class LineMessageProcessor{
    public static String extractProductCode(String message){
        if(String.isblank(message)){
            return null;
        }
        Pattern regex = Pattern.compile('CODE\\d{5}');
        Matcher matcher = regex.matcher(message);
        if(matcher.find()){
            return matcher.group(0);
        }
        return null;
    }
}